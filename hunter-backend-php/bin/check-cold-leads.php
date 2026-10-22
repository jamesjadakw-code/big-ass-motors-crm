<?php

declare(strict_types=1);

// Cron (daily): 0 7 * * *  cd /path/to/hunter-backend-php && php bin/check-cold-leads.php
// Optional first argument: days without contact (default 7).

require __DIR__ . '/_cli.php';

use Bam\Hunter\Database\Connection;
use Bam\Hunter\Tasks\TaskOrchestrator;

$days = isset($argv[1]) ? (int) $argv[1] : 7;

runCli('check-cold-leads', static function () use ($days): void {
    $created = (new TaskOrchestrator(Connection::fromEnv()))->checkColdLeads($days);
    echo date('c'), " created {$created} NURTURE task(s) for leads cold {$days}+ days", PHP_EOL;
});
