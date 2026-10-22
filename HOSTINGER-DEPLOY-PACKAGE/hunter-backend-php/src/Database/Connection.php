<?php

declare(strict_types=1);

namespace Bam\Hunter\Database;

use DateTimeImmutable;
use DateTimeZone;
use Exception;
use PDO;
use RuntimeException;

final class Connection
{
    /**
     * Builds a PDO connection from DB_HOST and DB_PORT (optional), or DB_SOCKET instead of both, plus DB_NAME,
     * DB_USER, DB_PASS and APP_TIMEZONE (optional, default America/New_York).
     * Values come from real environment variables first, then from a `.env` file in the package root
     * (shared hosts such as Hostinger can't set env vars for cron). Credentials never live in code.
     *
     * Time zone matches the CRM: PHP's default zone becomes APP_TIMEZONE (the CRM's app.timezone) and the MySQL
     * session gets that zone's current offset, as the CRM's bootstrap.php and inc/db.php do. DATETIME columns store
     * wall-clock time, so Hunter's dates and the CRM's (leads.created_at, call_log.created_at) must share one zone.
     * Real prepared statements, exceptions on error.
     */
    public static function fromEnv(?string $envFile = null): PDO
    {
        $file = self::parseEnvFile($envFile ?? dirname(__DIR__, 2) . '/.env');

        $get = static function (string $key, ?string $default = null) use ($file): string {
            $v = getenv($key);
            if ($v === false || $v === '') {
                $v = $file[$key] ?? '';
            }
            if ($v === '') {
                if ($default !== null) {
                    return $default;
                }
                throw new RuntimeException("Missing required setting {$key} (set it in .env or the environment)");
            }
            return $v;
        };

        $zone = $get('APP_TIMEZONE', 'America/New_York');
        try {
            date_default_timezone_set((new DateTimeZone($zone))->getName());
        } catch (Exception) {
            throw new RuntimeException("APP_TIMEZONE '{$zone}' is not a valid time zone");
        }

        $socket = $get('DB_SOCKET', '');
        $server = $socket !== ''
            ? 'unix_socket=' . $socket
            : sprintf('host=%s;port=%s', $get('DB_HOST'), $get('DB_PORT', '3306'));

        $dsn = sprintf('mysql:%s;dbname=%s;charset=utf8mb4', $server, $get('DB_NAME'));

        return new PDO($dsn, $get('DB_USER'), $get('DB_PASS', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '" . (new DateTimeImmutable())->format('P') . "'",
        ]);
    }

    /** @return array<string, string> KEY=VALUE lines; `#` comments and blank lines ignored; quotes stripped. */
    private static function parseEnvFile(string $path): array
    {
        if (!is_file($path) || !is_readable($path)) {
            return [];
        }
        $out = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[-1] === $v[0]) {
                $v = substr($v, 1, -1);
            }
            if (preg_match('/^[A-Z][A-Z0-9_]*$/', $k) === 1) {
                $out[$k] = $v;
            }
        }
        return $out;
    }
}
