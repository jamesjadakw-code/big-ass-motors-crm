<?php

declare(strict_types=1);

// Usage:
//   php bin/parse-specs.php                # parses & backfills all inventory.ai_specs and leads.requirements
//   php bin/parse-specs.php <inventory_id> # parses & updates a single inventory unit
//   php bin/parse-specs.php --full         # also parse description, specs and brochure blocks (default is title only)

require __DIR__ . '/_cli.php';

use Bam\Hunter\Database\Connection;
use Bam\Hunter\Parser\SpecParser;

// Load authoritative OEM specs helper if present alongside the CRM
$oemPaths = [
    __DIR__ . '/../../public_html/bam_app/inc/oem_specs.php',
    __DIR__ . '/../../bam_app/inc/oem_specs.php',
];
foreach ($oemPaths as $p) {
    if (is_file($p)) {
        if (!defined('BAM_APP')) {
            define('BAM_APP', true);
        }
        require_once $p;
        break;
    }
}

// Default: year/make/model/category come from the machine title only. --full also parses description, specs and
// the brochure blocks.
$full = in_array('--full', $argv, true);
$positional = array_values(array_filter(array_slice($argv, 1), static fn (string $a): bool => !str_starts_with($a, '--')));
$targetUnitId = $positional[0] ?? null;

runCli('parse-specs', static function () use ($targetUnitId, $full): void {
    $pdo = Connection::fromEnv();

    if ($targetUnitId !== null && $targetUnitId !== '') {
        $stmt = $pdo->prepare('SELECT * FROM inventory WHERE id = :id');
        $stmt->execute(['id' => $targetUnitId]);
        $units = $stmt->fetchAll();
    } else {
        $units = $pdo->query('SELECT * FROM inventory ORDER BY id')->fetchAll();
    }

    $updUnit = $pdo->prepare('UPDATE inventory SET ai_specs = :specs WHERE id = :id');
    $unitsUpdated = 0;

    foreach ($units as $u) {
        $oem = function_exists('oem_specs_for_unit') ? oem_specs_for_unit($u) : [];
        $parsed = $full ? SpecParser::parseUnit($u, $oem) : SpecParser::parseTitle(SpecParser::unitTitle($u), $oem);
        if ($parsed === []) {
            continue;
        }
        $mergedJson = SpecParser::mergeIntoAiSpecs(
            is_string($u['ai_specs'] ?? null) ? $u['ai_specs'] : null,
            $parsed
        );
        if ($mergedJson !== ($u['ai_specs'] ?? null)) {
            $updUnit->execute(['specs' => $mergedJson, 'id' => $u['id']]);
            $unitsUpdated++;
        }
    }
    printf("Inventory specs parsed: %d/%d unit(s) updated.\n", $unitsUpdated, count($units));

    // If running in full batch mode, also backfill leads.requirements where missing
    if ($targetUnitId === null || $targetUnitId === '') {
        $leads = $pdo->query('SELECT * FROM leads WHERE requirements IS NULL ORDER BY id')->fetchAll();
        $updLead = $pdo->prepare('UPDATE leads SET requirements = :req WHERE id = :id');
        $leadsUpdated = 0;

        foreach ($leads as $l) {
            $req = SpecParser::parseLeadRequirements($l);
            if ($req === []) {
                continue;
            }
            $updLead->execute([
                'req' => json_encode($req, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                'id'  => $l['id'],
            ]);
            $leadsUpdated++;
        }
        printf("Lead requirements parsed: %d/%d lead(s) backfilled.\n", $leadsUpdated, count($leads));
    }
});
