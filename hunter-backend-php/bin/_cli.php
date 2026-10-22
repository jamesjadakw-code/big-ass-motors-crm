<?php

declare(strict_types=1);

// Shared start of every bin/ script: loads the package and refuses to run outside the CLI.

require __DIR__ . '/../autoload.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

/** Runs $main and exits 0; any uncaught error prints "<label> failed: ..." to STDERR and exits 1. */
function runCli(string $label, callable $main): never
{
    try {
        $main();
    } catch (Throwable $e) {
        fwrite(STDERR, "{$label} failed: " . $e->getMessage() . PHP_EOL);
        exit(1);
    }
    exit(0);
}
