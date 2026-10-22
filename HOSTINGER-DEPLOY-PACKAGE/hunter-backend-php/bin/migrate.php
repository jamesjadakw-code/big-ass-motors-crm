<?php

declare(strict_types=1);

// Usage: DB_HOST=... DB_NAME=... DB_USER=... DB_PASS=... php bin/migrate.php
// Idempotent: safe to run on every deploy. Back up the database before the first run.

require __DIR__ . '/_cli.php';

use Bam\Hunter\Database\Connection;
use Bam\Hunter\Database\Migrator;

runCli('Migration', static function (): void {
    foreach ((new Migrator(Connection::fromEnv()))->run() as $line) {
        echo $line, PHP_EOL;
    }
    echo 'Migration complete.', PHP_EOL;
});
