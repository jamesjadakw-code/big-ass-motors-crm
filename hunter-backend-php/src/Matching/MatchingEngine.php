<?php

declare(strict_types=1);

namespace Bam\Hunter\Matching;

use Bam\Hunter\Crm\LiveCrm;
use Bam\Hunter\Enum\TaskType;
use Bam\Hunter\Tasks\TaskOrchestrator;
use InvalidArgumentException;
use JsonException;
use PDO;

/**
 * Compares a Live, verified inventory unit (status = 'Live' AND verified_at IS NOT NULL) with a lead's
 * `leads.requirements`. A score strictly greater than 80% creates an URGENT (priority 1) MATCH_ALERT task.
 * Draft or unverified units are never matched, so no alert is created on an unverified save.
 *
 * Unit specs come from the CRM's own inventory columns (UNIT_COLUMNS). Horsepower has no column, so it is read from
 * `inventory.ai_specs`: the flat `hp` key written by SpecParser (OEM-filled values carry `hp_source = 'oem'`), else a
 * legacy "Horsepower" entry.
 *
 * specs keys:         year, make, model, category, hours, hp, asking_price
 * requirements keys:  category, make, model, min_year, max_hours, min_hp, budget_max
 */
final class MatchingEngine
{
    /** A score must be strictly above this to trigger an alert. */
    public const ALERT_THRESHOLD = 80.0;

    private const PAGE_SIZE = 500;

    /** Inventory columns read for matching; the asking price is the public list price. */
    private const UNIT_COLUMNS = 'id, status, verified_at, year, make, model, category, hours, public_price, ai_specs';

    /** Make spellings the CRM uses for the same brand, normalized => canonical. */
    private const MAKE_ALIASES = ['cat' => 'caterpillar'];

    /** Shortest normalized value that may match by containment, so "20" can't match "D20x22". */
    private const MIN_CONTAINED_LENGTH = 3;

    public function __construct(
        private readonly PDO $pdo,
        private readonly TaskOrchestrator $tasks,
    ) {
    }

    /**
     * True only for a unit that is Live and verified. This is the single gate for MATCH_ALERT creation.
     *
     * @param array<string, mixed> $unit an inventory row with at least `status` and `verified_at`
     */
    public static function isMatchable(array $unit): bool
    {
        $verified = $unit['verified_at'] ?? null;
        return ($unit['status'] ?? null) === LiveCrm::LIVE_UNIT_STATUS
            && is_string($verified)
            && trim($verified) !== ''
            && !str_starts_with($verified, '0000-00-00');
    }

    /**
     * Call after a listing is saved, verified or goes Live. Units that are not Live and verified are never matched.
     * Returns every qualifying lead as ['lead_id' => id, 'score' => float, 'task_id' => ?int].
     * task_id is null when an open alert for that lead + listing already existed.
     *
     * @return list<array{lead_id: int|string, score: float, task_id: ?int}>
     */
    public function matchInventory(int|string $inventoryId): array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::UNIT_COLUMNS . ' FROM inventory WHERE id = :id');
        $stmt->execute(['id' => $inventoryId]);
        $unit = $stmt->fetch();
        if ($unit === false) {
            throw new InvalidArgumentException("Inventory {$inventoryId} does not exist");
        }
        if (!self::isMatchable($unit)) {
            return [];
        }
        $specs = $this->unitSpecs($unit);

        $page = $this->pdo->prepare(
            'SELECT id, requirements FROM leads
             WHERE ' . LiveCrm::ACTIVE_LEAD . ' AND requirements IS NOT NULL AND id > :after
             ORDER BY id LIMIT :page'
        );
        $page->bindValue('page', self::PAGE_SIZE, PDO::PARAM_INT);

        $matches = [];
        $after = ''; // first page: every id is > '' (an INT id compares as > 0, a string id as > '')
        do {
            $page->bindValue('after', (string) $after);
            $page->execute();
            $leads = $page->fetchAll();

            foreach ($leads as $lead) {
                $after = $lead['id'];
                $requirements = $this->decode($lead['requirements']);
                if ($requirements === null) {
                    continue;
                }
                $score = self::score($specs, $requirements);
                if ($score > self::ALERT_THRESHOLD) {
                    $matches[] = $this->alert($lead['id'], $inventoryId, $score);
                }
            }
        } while (count($leads) === self::PAGE_SIZE);

        return $matches;
    }

    /**
     * Call when a lead is created or its requirements change: checks an active lead against Live inventory.
     *
     * @return list<array{lead_id: int|string, score: float, task_id: ?int}>
     */
    public function matchLead(int|string $leadId): array
    {
        $stmt = $this->pdo->prepare('SELECT requirements FROM leads WHERE id = :id AND ' . LiveCrm::ACTIVE_LEAD);
        $stmt->execute(['id' => $leadId]);
        $requirements = $this->decode($stmt->fetchColumn()); // false (no such active lead) decodes to null
        if ($requirements === null) {
            return [];
        }

        $units = $this->pdo->prepare(
            'SELECT ' . self::UNIT_COLUMNS . ' FROM inventory WHERE status = :live AND ' . LiveCrm::VERIFIED_UNIT
        );
        $units->execute(['live' => LiveCrm::LIVE_UNIT_STATUS]);

        $matches = [];
        foreach ($units->fetchAll() as $unit) {
            $score = self::score($this->unitSpecs($unit), $requirements);
            if ($score > self::ALERT_THRESHOLD) {
                $matches[] = $this->alert($leadId, $unit['id'], $score);
            }
        }
        return $matches;
    }

    /**
     * Pure scoring function (no I/O). Only criteria the lead actually specified count, so a lead that
     * says "Vermeer D24x40, under $150k" is judged on exactly that. A lead that names neither a category nor a
     * model scores 0: make or price alone is never a match. Missing listing data scores 0 for that criterion
     * (unverified specs are not guessed). Returns 0-100, one decimal.
     *
     * @param array<string, mixed> $specs
     * @param array<string, mixed> $req
     */
    public static function score(array $specs, array $req): float
    {
        $category = self::text($req['category'] ?? null);
        $make = self::make($req['make'] ?? null);
        $model = self::text($req['model'] ?? null);
        if ($category === '' && $model === '') {
            return 0.0;
        }

        $parts = []; // [weight, fraction earned 0-1] for each criterion the lead specified
        if ($category !== '') {
            $parts[] = [25, self::overlaps(self::text($specs['category'] ?? null), $category) ? 1.0 : 0.0];
        }
        if ($make !== '') {
            $parts[] = [15, $make === self::make($specs['make'] ?? null) ? 1.0 : 0.0];
        }
        if ($model !== '') {
            $have = self::text($specs['model'] ?? null);
            $series = self::series($model);
            $parts[] = [20, match (true) {
                self::overlaps($have, $model) => 1.0,
                $series !== '' && $series === self::series($have) => 0.7, // same series, different model (D24x26 vs D24x40)
                default => 0.0,
            }];
        }
        $budget = self::number($req['budget_max'] ?? null);
        if ($budget !== null && $budget > 0) {
            $parts[] = [20, self::within(self::number($specs['asking_price'] ?? null), $budget, 1.1)];
        }
        $maxHours = self::number($req['max_hours'] ?? null);
        if ($maxHours !== null && $maxHours > 0) {
            $parts[] = [10, self::within(self::number($specs['hours'] ?? null), $maxHours, 1.2)];
        }
        $minHp = self::number($req['min_hp'] ?? null);
        if ($minHp !== null && $minHp > 0) {
            $hp = self::number($specs['hp'] ?? null);
            $parts[] = [10, $hp !== null && $hp >= $minHp ? 1.0 : 0.0];
        }
        $minYear = self::number($req['min_year'] ?? null);
        if ($minYear !== null && $minYear > 0) {
            $year = self::number($specs['year'] ?? null);
            $parts[] = [5, $year !== null && $year >= $minYear ? 1.0 : 0.0];
        }

        $max = array_sum(array_column($parts, 0));
        $earned = array_sum(array_map(static fn (array $p): float => $p[0] * $p[1], $parts));
        return $max > 0 ? round($earned / $max * 100, 1) : 0.0;
    }

    /**
     * @param array<string, mixed> $unit an inventory row with UNIT_COLUMNS
     * @return array<string, mixed> specs in the shape score() reads
     */
    public static function unitSpecs(array $unit): array
    {
        return [
            'year' => $unit['year'],
            'make' => $unit['make'],
            'model' => $unit['model'],
            'category' => $unit['category'],
            'hours' => $unit['hours'],
            'asking_price' => $unit['public_price'],
            'hp' => self::horsepower($unit['ai_specs'] ?? null),
        ];
    }

    /**
     * Horsepower from ai_specs: the flat `hp` key SpecParser writes first, then a legacy "Horsepower" entry (top level or
     * under "specs"), e.g. "130 HP" => 130.0; null when not recorded.
     */
    private static function horsepower(mixed $aiSpecs): ?float
    {
        $data = self::decode($aiSpecs);
        $value = $data['hp'] ?? $data['Horsepower'] ?? $data['specs']['Horsepower'] ?? null;
        if (!is_scalar($value) || preg_match('/\d+(?:\.\d+)?/', str_replace(',', '', (string) $value), $m) !== 1) {
            return null;
        }
        return (float) $m[0];
    }

    /** @return array{lead_id: int|string, score: float, task_id: ?int} */
    private function alert(int|string $leadId, int|string $inventoryId, float $score): array
    {
        $taskId = $this->tasks->createTask(
            $leadId,
            TaskType::MatchAlert,
            TaskOrchestrator::PRIORITY_URGENT,
            "MATCH_ALERT:inventory:{$inventoryId}", // stable per lead+listing => re-runs never duplicate
        );
        return ['lead_id' => $leadId, 'score' => $score, 'task_id' => $taskId];
    }

    /** @return array<string, mixed>|null null for empty or malformed JSON (logged, never fatal to the batch) */
    private static function decode(mixed $json): ?array
    {
        if (!is_string($json) || $json === '') {
            return null;
        }
        try {
            $data = json_decode($json, true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            error_log('MatchingEngine: malformed JSON skipped: ' . $e->getMessage());
            return null;
        }
        return is_array($data) ? $data : null;
    }

    /**
     * Either normalized value contains the other. Equal values always match; otherwise the shorter one needs
     * MIN_CONTAINED_LENGTH characters. A missing value never matches.
     */
    private static function overlaps(string $have, string $want): bool
    {
        if ($have === '' || $want === '') {
            return false;
        }
        if ($have === $want) {
            return true;
        }
        return min(strlen($have), strlen($want)) >= self::MIN_CONTAINED_LENGTH
            && (str_contains($have, $want) || str_contains($want, $have));
    }

    /** Full credit at or under the limit, half credit within $slack x limit; an unknown value earns nothing. */
    private static function within(?float $value, float $limit, float $slack): float
    {
        return match (true) {
            $value === null => 0.0,
            $value <= $limit => 1.0,
            $value <= $limit * $slack => 0.5,
            default => 0.0,
        };
    }

    private static function text(mixed $v): string
    {
        return is_scalar($v) ? strtolower((string) preg_replace('/[^a-z0-9]/i', '', (string) $v)) : '';
    }

    /** Normalized make with CRM spelling variants folded together ("CAT" and "Caterpillar" are one make). */
    private static function make(mixed $v): string
    {
        $make = self::text($v);
        return self::MAKE_ALIASES[$make] ?? $make;
    }

    /** Leading letters+digits of a normalized model, e.g. "d24x40s3" -> "d24". */
    private static function series(string $normalized): string
    {
        return preg_match('/^[a-z]+\d+/', $normalized, $m) === 1 ? $m[0] : '';
    }

    private static function number(mixed $v): ?float
    {
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        if (is_string($v)) {
            $clean = str_replace([',', '$', ' '], '', $v);
            return is_numeric($clean) ? (float) $clean : null;
        }
        return null;
    }
}
