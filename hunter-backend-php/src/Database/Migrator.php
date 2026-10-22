<?php

declare(strict_types=1);

namespace Bam\Hunter\Database;

use Bam\Hunter\Enum\SellerType;
use Bam\Hunter\Enum\SourceType;
use Bam\Hunter\Enum\TaskStatus;
use Bam\Hunter\Enum\TaskType;
use BackedEnum;
use PDO;
use RuntimeException;

/**
 * Idempotent schema migration: safe to run repeatedly, on MySQL 5.7+/8 and MariaDB 10.3+.
 * (MySQL has no ADD COLUMN IF NOT EXISTS, so every change checks information_schema first.)
 * All identifiers are hard-coded below; nothing here is built from user input.
 *
 * Hunter reuses the CRM's own data wherever it exists: lead status is leads.lead_status, contacts come from
 * call_log, owners from tw_assign, and unit specs from inventory's own columns. So the migration adds no second
 * lead status and leaves the CRM's inventory.ai_specs alone.
 */
final class Migrator
{
    /** CRM tables Hunter reads. The migration changes only leads and inventory (adds columns), never the others. */
    private const REQUIRED_TABLES = ['leads', 'inventory', 'call_log', 'tw_assign'];

    /** @var list<string> */
    private array $log = [];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<string> */
    public function run(): array
    {
        foreach (self::REQUIRED_TABLES as $required) {
            if (!$this->tableExists($required)) {
                throw new RuntimeException("Expected existing table `{$required}` was not found.");
            }
        }

        $this->migrateLeads();
        $this->migrateTasks();
        $this->migrateInventory();

        return $this->log;
    }

    private function migrateLeads(): void
    {
        $this->addColumn('leads', 'demand_cluster_id', 'INT NULL DEFAULT NULL');
        $this->addColumn('leads', 'last_contacted_at', 'TIMESTAMP NULL DEFAULT NULL');
        // Buyer requirements read by the matching engine: {"category","make","model","min_year","max_hours","min_hp","budget_max"}
        $this->addColumn('leads', 'requirements', 'JSON NULL');

        $this->addIndex('leads', 'idx_leads_demand_cluster', 'demand_cluster_id');
        $this->addIndex('leads', 'idx_leads_last_contacted', 'last_contacted_at');
    }

    private function migrateTasks(): void
    {
        if ($this->tableExists('tasks')) {
            $this->log[] = 'tasks: already exists, skipped';
            return;
        }

        // Match the legacy leads.id type exactly (INT, BIGINT, CHAR(36) UUID...) or the foreign key is rejected.
        $leadIdDef = $this->columnDefinition('leads', 'id');
        $type = $this->enumSql(TaskType::class);
        $status = $this->enumSql(TaskStatus::class);
        $pending = $this->quote(TaskStatus::Pending);

        $this->pdo->exec(<<<SQL
            CREATE TABLE `tasks` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `lead_id` {$leadIdDef} NOT NULL,
                `user_id` INT NULL DEFAULT NULL,
                `task_type` ENUM({$type}) NOT NULL,
                `priority` TINYINT UNSIGNED NOT NULL DEFAULT 2,
                `due_date` DATETIME NOT NULL,
                `status` ENUM({$status}) NOT NULL DEFAULT {$pending},
                `trigger_event` VARCHAR(191) NOT NULL,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `completed_at` TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_tasks_queue` (`status`, `due_date`),
                KEY `idx_tasks_user_queue` (`user_id`, `status`, `due_date`),
                KEY `idx_tasks_lead_lookup` (`lead_id`, `task_type`, `status`),
                CONSTRAINT `chk_tasks_priority` CHECK (`priority` BETWEEN 1 AND 3),
                CONSTRAINT `fk_tasks_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        SQL);
        $this->log[] = 'tasks: created';
    }

    private function migrateInventory(): void
    {
        $source = $this->enumSql(SourceType::class);
        $seller = $this->enumSql(SellerType::class);
        $this->addColumn('inventory', 'source_type', "ENUM({$source}) NOT NULL DEFAULT " . $this->quote(SourceType::PrivateImport));
        $this->addColumn('inventory', 'seller_type', "ENUM({$seller}) NOT NULL DEFAULT " . $this->quote(SellerType::PrivateSeller));

        // Named for their columns: the CRM already has an idx_inventory_seller (on seller_id).
        $this->addIndex('inventory', 'idx_inventory_source_type', 'source_type');
        $this->addIndex('inventory', 'idx_inventory_seller_type', 'seller_type');
    }

    // ---- helpers ----

    /** @param class-string<BackedEnum> $enum */
    private function enumSql(string $enum): string
    {
        return implode(',', array_map($this->quote(...), $enum::cases()));
    }

    private function quote(BackedEnum $case): string
    {
        return $this->pdo->quote((string) $case->value);
    }

    private function addColumn(string $table, string $column, string $definition): void
    {
        if ($this->columnExists($table, $column)) {
            $this->log[] = "{$table}.{$column}: already exists, skipped";
            return;
        }
        $this->pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        $this->log[] = "{$table}.{$column}: added";
    }

    /** Adds a one-column index; an index of the same name on other columns is an error, never a silent skip. */
    private function addIndex(string $table, string $name, string $column): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i'
        );
        $stmt->execute(['t' => $table, 'i' => $name]);
        $existing = $stmt->fetchColumn(); // NULL when no such index
        if ($existing === $column) {
            $this->log[] = "{$table}: index {$name} already exists, skipped";
            return;
        }
        if ($existing !== null && $existing !== false) {
            throw new RuntimeException("Index {$table}.{$name} already exists on ({$existing}), expected ({$column}).");
        }
        $this->pdo->exec("ALTER TABLE `{$table}` ADD INDEX `{$name}` (`{$column}`)");
        $this->log[] = "{$table}: index {$name} added";
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t'
        );
        $stmt->execute(['t' => $table]);
        return (int) $stmt->fetchColumn() > 0;
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c'
        );
        $stmt->execute(['t' => $table, 'c' => $column]);
        return (int) $stmt->fetchColumn() > 0;
    }

    /** Column type plus charset/collation (needed for string keys so the FK matches). */
    private function columnDefinition(string $table, string $column): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c'
        );
        $stmt->execute(['t' => $table, 'c' => $column]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new RuntimeException("Column {$table}.{$column} not found.");
        }
        $def = (string) $row['COLUMN_TYPE'];
        if ($row['CHARACTER_SET_NAME'] !== null) {
            $def .= " CHARACTER SET {$row['CHARACTER_SET_NAME']} COLLATE {$row['COLLATION_NAME']}";
        }
        return $def;
    }
}
