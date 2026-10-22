<?php

declare(strict_types=1);

// Usage: php bin/match-inventory.php <inventory_id>
// Or call from the listing-save code path:
//   (new MatchingEngine($pdo, new TaskOrchestrator($pdo)))->matchInventory($newInventoryId);

require __DIR__ . '/_cli.php';

use Bam\Hunter\Database\Connection;
use Bam\Hunter\Matching\MatchingEngine;
use Bam\Hunter\Tasks\TaskOrchestrator;

$inventoryId = $argv[1] ?? '';
if ($inventoryId === '') {
    fwrite(STDERR, "Usage: php bin/match-inventory.php <inventory_id>\n");
    exit(2);
}

runCli('match-inventory', static function () use ($inventoryId): void {
    $pdo = Connection::fromEnv();
    $matches = (new MatchingEngine($pdo, new TaskOrchestrator($pdo)))->matchInventory($inventoryId);
    foreach ($matches as $m) {
        printf(
            "lead %s  score %.1f  %s\n",
            $m['lead_id'],
            $m['score'],
            $m['task_id'] !== null ? "MATCH_ALERT task #{$m['task_id']} created" : 'open alert already exists',
        );
    }
    echo count($matches), ' qualifying lead(s).', PHP_EOL;
});
