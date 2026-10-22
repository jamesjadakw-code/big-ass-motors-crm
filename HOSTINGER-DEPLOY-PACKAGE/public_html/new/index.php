<?php
/**
 * BAM CRM - new React CRM, READ-ONLY (bigassmotorscrm.bigassmotors.com/new/).
 *  - Sign-in: the same login and session as /inventory/ (crm_boot -> require_admin). No bypass of any kind.
 *  - Data: hydrated from MySQL for the signed-in user only. Writes are refused (HTTP 405) and the DB session is set read-only.
 *  - ?state=1 returns the same data as JSON (for refresh), still behind the sign-in.
 */
declare(strict_types=1);
require __DIR__ . '/bam.php';
require_once BAM_ROOT . '/inc/crm_boot.php';      // $ME = require_admin(); crm_page_guard($ME);
require_once BAM_ROOT . '/inc/teamwork.php';
require_once BAM_ROOT . '/inc/inventory.php';
require_once BAM_ROOT . '/inc/settings.php';
require_once __DIR__ . '/state.php';

header('Cache-Control: no-store, private');

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    json_out(['ok' => false, 'error' => 'The new CRM is read-only for now. Nothing was saved.'], 405);
}

// Belt and braces: from here on MySQL itself refuses any INSERT/UPDATE/DELETE on this connection.
try { db()->exec('SET SESSION TRANSACTION READ ONLY'); } catch (Throwable $e) { error_log('[new] read-only flag: ' . $e->getMessage()); }

$built = new_build_state($ME);

if (isset($_GET['state'])) {
    json_out(['ok' => true, 'readOnly' => true, 'counts' => $built['counts'], 'state' => $built['state']]);
}

$app = __DIR__ . '/app/index.html';
if (!is_file($app)) {
    http_response_code(503);
    echo '<!doctype html><meta charset="utf-8"><title>BAM CRM</title><p style="font:16px system-ui;margin:60px auto;max-width:520px">The new CRM is not installed yet (app/index.html is missing).</p>';
    exit;
}
$me = crm_me_payload($ME);
unset($me['prefs']);
$boot = '<script>'
      . 'window.BAM_PDO_STATE=' . new_json_for_script($built['state']) . ';'
      . 'window.BAM_ME=' . new_json_for_script($me) . ';'
      . 'window.BAM_READ_ONLY=true;'
      . 'window.BAM_PHP_BACK_URL=' . new_json_for_script(url('index.php')) . ';'
      . '</script>';
$html = (string) file_get_contents($app);
$html = preg_replace('~</head>~i', $boot . '</head>', $html, 1) ?? $html;
header('Content-Type: text/html; charset=utf-8');
echo $html;
