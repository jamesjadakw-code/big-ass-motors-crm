<?php

declare(strict_types=1);

namespace Bam\Hunter\Crm;

use Bam\Hunter\Matching\MatchingEngine;
use Bam\Hunter\Parser\SpecParser;
use Bam\Hunter\Tasks\TaskOrchestrator;
use InvalidArgumentException;
use PDO;

/**
 * The one entry point the live CRM calls after a unit is saved, verified or listed.
 *
 *  1. Keeps `inventory.ai_specs` complete: flat matching keys (year, make, model, category, hours, hp, hp_source,
 *     asking_price) plus the structured brochure blocks (specs, highlights, package_includes, subsystems).
 *     Non-destructive: existing keys are kept, and OEM horsepower only fills `hp` when it is missing.
 *  2. Matches the unit against active leads ONLY when it is Live AND verified (MatchingEngine::isMatchable).
 *     A Draft or unverified save never creates a MATCH_ALERT task.
 */
final class UnitSync
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Parses the unit row (plus OEM specs) and writes the merged result to `inventory.ai_specs` when it changed.
     *
     * @param ?callable(array<string, mixed>): array<string, string> $oemSpecsFor `oem_specs_for_unit()` from the CRM's
     *        inc/oem_specs.php, called with the inventory row; omit to skip OEM fill.
     * @param bool $titleOnly true (default): read year/make/model/category from the machine title only
     *        (SpecParser::parseTitle). false: the full parse of description, specs and brochure blocks (parseUnit).
     * @return bool true when ai_specs was written
     */
    public function syncAiSpecs(int|string $inventoryId, ?callable $oemSpecsFor = null, bool $titleOnly = true): bool
    {
        $stmt = $this->pdo->prepare('SELECT * FROM inventory WHERE id = :id');
        $stmt->execute(['id' => $inventoryId]);
        $unit = $stmt->fetch();
        if ($unit === false) {
            throw new InvalidArgumentException("Inventory {$inventoryId} does not exist");
        }

        $oem = $oemSpecsFor !== null ? $oemSpecsFor($unit) : [];
        $existing = is_string($unit['ai_specs'] ?? null) && $unit['ai_specs'] !== '' ? $unit['ai_specs'] : null;
        $oem = is_array($oem) ? $oem : [];
        $parsed = $titleOnly
            ? SpecParser::parseTitle(SpecParser::unitTitle($unit), $oem)
            : SpecParser::parseUnit($unit, $oem);
        $merged = SpecParser::mergeIntoAiSpecs($existing, $parsed);
        if ($merged === $existing) {
            return false;
        }

        $update = $this->pdo->prepare('UPDATE inventory SET ai_specs = :specs WHERE id = :id');
        $update->execute(['specs' => $merged, 'id' => $inventoryId]);
        return true;
    }

    /**
     * Call after a unit is saved, verified or listed. Syncs ai_specs first so matching reads the fresh `hp`, then
     * matches only a Live, verified unit.
     *
     * @param ?callable(array<string, mixed>): array<string, string> $oemSpecsFor see syncAiSpecs()
     * @return array{ai_specs_updated: bool, matchable: bool, matches: list<array{lead_id: int|string, score: float, task_id: ?int}>}
     */
    public function onUnitChanged(int|string $inventoryId, ?callable $oemSpecsFor = null, bool $titleOnly = true): array
    {
        $updated = $this->syncAiSpecs($inventoryId, $oemSpecsFor, $titleOnly);

        $stmt = $this->pdo->prepare('SELECT id, status, verified_at FROM inventory WHERE id = :id');
        $stmt->execute(['id' => $inventoryId]);
        $row = $stmt->fetch();
        $matchable = $row !== false && MatchingEngine::isMatchable($row);

        $matches = $matchable
            ? (new MatchingEngine($this->pdo, new TaskOrchestrator($this->pdo)))->matchInventory($inventoryId)
            : [];

        return ['ai_specs_updated' => $updated, 'matchable' => $matchable, 'matches' => $matches];
    }
}
