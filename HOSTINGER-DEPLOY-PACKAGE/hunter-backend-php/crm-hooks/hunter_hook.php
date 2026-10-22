<?php
/**
 * Drop-in bridge between the live PHP CRM and the Hunter backend. See INTEGRATION.md for where to call it.
 *
 * Copy this file to the CRM's inc/ folder (BAM_ROOT/inc/hunter_hook.php) and
 *   require_once BAM_ROOT . '/inc/hunter_hook.php';
 *   bam_hunter_on_unit_changed($unitId);
 * after a unit is saved, verified or listed.
 *
 * Reuses the active CRM PDO connection `db()` when running inside the Hostinger CRM (Zero-API).
 * Never throws: any failure is written to the PHP error log and the CRM action carries on.
 */
declare(strict_types=1);

if (!function_exists('bam_hunter_on_unit_changed')) {
    function bam_hunter_on_unit_changed(int $inventoryId): void
    {
        try {
            $candidates = array_filter([
                getenv('BAM_HUNTER_ROOT') ?: null,
                defined('BAM_ROOT') ? BAM_ROOT . '/hunter-backend-php' : null,
                defined('BAM_ROOT') ? dirname(BAM_ROOT) . '/hunter-backend-php' : null,
                defined('BAM_ROOT') ? dirname(BAM_ROOT, 2) . '/hunter-backend-php' : null,
                'C:/Users/daley/OneDrive/Desktop/CLAUDE CRM/hunter-backend-php',
            ]);
            $root = null;
            foreach ($candidates as $dir) {
                if (is_file($dir . '/autoload.php')) {
                    $root = $dir;
                    break;
                }
            }
            if ($root === null) {
                error_log('hunter hook: hunter-backend-php not found; set BAM_HUNTER_ROOT');
                return;
            }
            require_once $root . '/autoload.php';

            if (!function_exists('oem_specs_for_unit') && defined('BAM_ROOT') && is_file(BAM_ROOT . '/inc/oem_specs.php')) {
                require_once BAM_ROOT . '/inc/oem_specs.php';
            }
            $oemFor = function_exists('oem_specs_for_unit')
                ? static fn (array $unit): array => (array) oem_specs_for_unit($unit)
                : null;

            $pdo = function_exists('db') ? db() : \Bam\Hunter\Database\Connection::fromEnv($root . '/.env');
            (new \Bam\Hunter\Crm\UnitSync($pdo))->onUnitChanged($inventoryId, $oemFor);
        } catch (\Throwable $e) {
            error_log('hunter hook failed for unit ' . $inventoryId . ': ' . $e->getMessage());
        }
    }
}
