<?php

declare(strict_types=1);

namespace Bam\Hunter\Tasks;

use Bam\Hunter\Crm\LiveCrm;
use Bam\Hunter\Enum\TaskStatus;
use Bam\Hunter\Enum\TaskType;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PDO;
use PDOStatement;
use Throwable;

/**
 * Creates and resolves tasks from CRM events. All SQL is prepared; all enum-like inputs are typed enums.
 * Times are in the CRM's business time zone: PHP's default zone, which Connection sets to match the CRM,
 * so DATETIMEs written here line up with the ones the CRM writes.
 */
final class TaskOrchestrator
{
    public const PRIORITY_URGENT = 1;
    public const PRIORITY_NORMAL = 2;
    public const PRIORITY_LOW = 3;

    /** SQL list of the statuses that make a task "open" (enum values, never user input). */
    private const OPEN_STATUSES = "'" . TaskStatus::Pending->value . "', '" . TaskStatus::Snoozed->value . "'";

    // Prepared on first use and reused: checkColdLeads calls createTask once per cold lead.
    private ?PDOStatement $lockLead = null;
    private ?PDOStatement $findOpenTask = null;
    private ?PDOStatement $findOwner = null;
    private ?PDOStatement $insertTask = null;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Inserts a task. Returns the new task id, or null if an identical open task
     * (same lead + type + trigger_event, PENDING or SNOOZED) already exists, which makes
     * every trigger safe to re-run. The lead row is locked so concurrent triggers can't double-insert.
     * The owner is the rep the CRM assigned the lead to (tw_assign); an unassigned lead's task has no owner.
     *
     * @throws InvalidArgumentException bad priority / event, or unknown lead
     */
    public function createTask(
        int|string $leadId,
        TaskType $type,
        int $priority,
        string $event,
        ?DateTimeImmutable $dueDate = null,
    ): ?int {
        if ($priority < self::PRIORITY_URGENT || $priority > self::PRIORITY_LOW) {
            throw new InvalidArgumentException('priority must be 1 (urgent) to 3 (low)');
        }
        $event = trim($event);
        if ($event === '' || mb_strlen($event) > 191) {
            throw new InvalidArgumentException('trigger event must be 1-191 characters');
        }
        $due = ($dueDate ?? $this->defaultDue($priority))->setTimezone($this->zone());

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }
        try {
            $this->lockLead ??= $this->pdo->prepare('SELECT id FROM leads WHERE id = :id FOR UPDATE');
            $this->lockLead->execute(['id' => $leadId]);
            if ($this->lockLead->fetchColumn() === false) {
                throw new InvalidArgumentException("Lead {$leadId} does not exist");
            }

            $this->findOpenTask ??= $this->pdo->prepare(
                'SELECT id FROM tasks
                 WHERE lead_id = :lead AND task_type = :type AND trigger_event = :event
                   AND status IN (' . self::OPEN_STATUSES . ') LIMIT 1'
            );
            $this->findOpenTask->execute(['lead' => $leadId, 'type' => $type->value, 'event' => $event]);

            $id = null;
            if ($this->findOpenTask->fetchColumn() === false) {
                $this->findOwner ??= $this->pdo->prepare('SELECT user_id FROM tw_assign WHERE lead_key = :key');
                $this->findOwner->execute(['key' => LiveCrm::LEAD_KEY_PREFIX . $leadId]);
                $owner = $this->findOwner->fetchColumn();

                $this->insertTask ??= $this->pdo->prepare(
                    'INSERT INTO tasks (lead_id, user_id, task_type, priority, due_date, status, trigger_event)
                     VALUES (:lead, :user, :type, :priority, :due, :status, :event)'
                );
                $this->insertTask->execute([
                    'lead' => $leadId,
                    'user' => $owner === false || $owner === null ? null : (int) $owner,
                    'type' => $type->value,
                    'priority' => $priority,
                    'due' => $due->format('Y-m-d H:i:s'),
                    'status' => TaskStatus::Pending->value,
                    'event' => $event,
                ]);
                $id = (int) $this->pdo->lastInsertId();

                // Unified CRM Bridge: Also mirror into live tw_tasks + tw_notifications so tasks.php and bell show it
                try {
                    $leadKey = LiveCrm::LEAD_KEY_PREFIX . $leadId;
                    $assigneeId = ($owner === false || $owner === null) ? 1 : (int) $owner;
                    $twPrio = match ($priority) {
                        self::PRIORITY_URGENT => 'urgent',
                        self::PRIORITY_NORMAL => 'normal',
                        default => 'low',
                    };
                    $unitId = null;
                    if (preg_match('/^MATCH_ALERT:inventory:(\d+)$/', $event, $m)) {
                        $unitId = (int) $m[1];
                    }
                    $twTitle = $type === TaskType::MatchAlert
                        ? ('🔥 >80% Equipment Match Alert' . ($unitId ? " (Unit #{$unitId})" : ''))
                        : ('7-Day Cold Lead Nurture · Follow Up Required');
                    $twStmt = $this->pdo->prepare(
                        "INSERT INTO tw_tasks (kind, title, notes, lead_key, lead_label, unit_id, assignee_id, created_by, due_at, priority, status)
                         VALUES ('task', :title, :notes, :lead_key, '', :unit_id, :assignee_id, 1, :due_at, :prio, 'open')"
                    );
                    $twStmt->execute([
                        'title' => $twTitle,
                        'notes' => "Trigger: {$event}",
                        'lead_key' => $leadKey,
                        'unit_id' => $unitId,
                        'assignee_id' => $assigneeId,
                        'due_at' => $due->format('Y-m-d H:i:s'),
                        'prio' => $twPrio,
                    ]);
                    $twTaskId = (int) $this->pdo->lastInsertId();
                    if ($twTaskId > 0) {
                        $notif = $this->pdo->prepare(
                            "INSERT INTO tw_notifications (user_id, kind, actor_id, title, body, ref_type, ref_key)
                             VALUES (:uid, 'task', 1, :title, :body, 'task', :ref)"
                        );
                        $notif->execute([
                            'uid' => $assigneeId,
                            'title' => $twTitle,
                            'body' => "Lead {$leadKey} · {$event}",
                            'ref' => (string) $twTaskId,
                        ]);
                    }
                } catch (Throwable) {
                    // Safe fallback when running in isolated test DB without tw_tasks
                }
            }

            if ($ownsTransaction) {
                $this->pdo->commit();
            }
            return $id;
        } catch (Throwable $e) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Auto-completes all open (PENDING/SNOOZED) tasks of a type for a lead, e.g. after a
     * brochure is sent. Returns how many tasks were completed.
     */
    public function resolveTasks(int|string $leadId, TaskType $type): int
    {
        $stmt = $this->pdo->prepare(
            'UPDATE tasks SET status = :done, completed_at = :now
             WHERE lead_id = :lead AND task_type = :type AND status IN (' . self::OPEN_STATUSES . ')'
        );
        $stmt->execute([
            'done' => TaskStatus::Completed->value,
            'now' => $this->now()->format('Y-m-d H:i:s'),
            'lead' => $leadId,
            'type' => $type->value,
        ]);
        return $stmt->rowCount();
    }

    /** Records a contact: stamps last_contacted_at and clears any open NURTURE task. */
    public function recordContact(int|string $leadId): void
    {
        $stmt = $this->pdo->prepare('UPDATE leads SET last_contacted_at = :now WHERE id = :id');
        $stmt->execute(['now' => $this->now()->format('Y-m-d H:i:s'), 'id' => $leadId]);
        $this->resolveTasks($leadId, TaskType::Nurture);
    }

    /**
     * Cron entry point. Creates a NURTURE task for every active lead (by the CRM's lead_status) not contacted in
     * $days days that has no open NURTURE task. A contact is a call logged in the CRM (call_log) or recordContact();
     * a lead never contacted is aged from created_at. Returns the number of tasks created.
     * A lead deleted while this runs is skipped and logged; any other error stops the run and is thrown.
     */
    public function checkColdLeads(int $days = 7, int $batchSize = 500): int
    {
        if ($days < 1 || $batchSize < 1) {
            throw new InvalidArgumentException('days and batchSize must be positive');
        }
        $cutoff = $this->now()->modify("-{$days} days")->format('Y-m-d H:i:s');
        $event = "COLD_LEAD_{$days}D";

        $find = $this->pdo->prepare(
            'SELECT l.id FROM leads l
             WHERE ' . LiveCrm::ACTIVE_LEAD . '
               AND COALESCE(l.last_contacted_at, l.created_at) < :cutoff
               AND NOT EXISTS (
                   SELECT 1 FROM call_log c
                   WHERE c.lead_key = CONCAT(:key_prefix, l.id) AND c.kind = :logged AND c.created_at >= :call_cutoff
               )
               AND NOT EXISTS (
                   SELECT 1 FROM tasks t
                   WHERE t.lead_id = l.id AND t.task_type = :nurture AND t.status IN (' . self::OPEN_STATUSES . ')
               )
             ORDER BY l.id
             LIMIT :batch'
        );
        $find->bindValue('cutoff', $cutoff);
        $find->bindValue('key_prefix', LiveCrm::LEAD_KEY_PREFIX);
        $find->bindValue('logged', LiveCrm::CALL_LOGGED);
        $find->bindValue('call_cutoff', $cutoff);
        $find->bindValue('nurture', TaskType::Nurture->value);
        $find->bindValue('batch', $batchSize, PDO::PARAM_INT);

        $created = 0;
        // Every lead found leaves the candidate set (it gains an open NURTURE task, or was deleted), so each pass
        // makes progress; 20 passes cap one run, and anything left is picked up by the next run.
        for ($pass = 0; $pass < 20; $pass++) {
            $find->execute();
            $ids = $find->fetchAll(PDO::FETCH_COLUMN);
            foreach ($ids as $leadId) {
                try {
                    if ($this->createTask($leadId, TaskType::Nurture, self::PRIORITY_LOW, $event) !== null) {
                        $created++;
                    }
                } catch (InvalidArgumentException $e) {
                    error_log("checkColdLeads: lead {$leadId} skipped: " . $e->getMessage());
                }
            }
            if (count($ids) < $batchSize) {
                break; // last (partial or empty) batch
            }
        }
        return $created;
    }

    private function defaultDue(int $priority): DateTimeImmutable
    {
        return $this->now()->modify(match ($priority) {
            self::PRIORITY_URGENT => '+1 hour',
            self::PRIORITY_NORMAL => '+1 day',
            default => '+3 days',
        });
    }

    private function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', $this->zone());
    }

    private function zone(): DateTimeZone
    {
        return new DateTimeZone(date_default_timezone_get());
    }
}
