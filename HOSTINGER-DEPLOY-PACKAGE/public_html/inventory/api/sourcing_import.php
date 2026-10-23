<?php
/**
 * Authenticated import endpoint for external sourcing sweeps (run from James's box).
 *   POST https://bigassmotorscrm.bigassmotors.com/inventory/api/sourcing_import.php
 *   Authorization: Bearer <sourcing.api_token from bam_config.php>
 *   Body: JSON array of listings | {"results":[...]} | CSV (Content-Type: text/csv) with a header row.
 * Fields (aliases accepted): url, source_site, listing_id, title, year, make, model, category/type/machine_class,
 *   hours, price/price_usd, location (or city+state), seller_name, seller_contact, photos (array or ; list), description, found_at.
 * Deduped by URL (+listing id). Each row is auto-matched to open wanted requests and to leads.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bam.php';
require_once BAM_ROOT . '/inc/sourcing.php';

header('X-Robots-Tag: noindex');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(['ok' => false, 'error' => 'POST only'], 405); }
$token = (string) cfg('sourcing.api_token', '');
$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$bearer = preg_match('/^Bearer\s+(\S+)$/i', $auth, $m) ? $m[1] : '';
$xToken = (string) ($_SERVER['HTTP_X_BAM_TOKEN'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '');
$given = $bearer !== '' ? $bearer : $xToken;
if (strlen($token) < 20 || str_starts_with($token, 'PASTE_') || str_starts_with($token, 'CHANGE_ME')) { json_out(['ok' => false, 'error' => 'Import API disabled: set sourcing.api_token (20+ chars) in bam_config.php'], 503); }
if ($given === '' || !hash_equals($token, $given)) {
    usleep(400000);
    error_log('[BAM] sourcing_import: bad token from ' . client_ip());
    json_out(['ok' => false, 'error' => 'Unauthorized'], 401);
}
$raw = (string) file_get_contents('php://input', false, null, 0, 20 * 1024 * 1024);
if ($raw === '') { json_out(['ok' => false, 'error' => 'Empty body'], 400); }
$type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (str_contains($type, 'csv')) {
    $rows = csv_text_rows($raw);
} elseif (str_starts_with(ltrim($raw), '[') || str_starts_with(ltrim($raw), '{')) {
    $j = json_decode($raw, true);
    if (!is_array($j)) { json_out(['ok' => false, 'error' => 'Invalid JSON'], 400); }
    $rows = array_is_list($j) ? $j : (array) ($j['listings'] ?? $j['results'] ?? $j['data'] ?? []);
} else {
    // Plain text / markdown daily sweep email from Gmail, Grok, or Gemini
    $rows = parse_daily_sweep_text($raw);
}
if (!$rows) { json_out(['ok' => false, 'error' => 'No rows or listing URLs found'], 400); }
set_time_limit(300);

// Default to creating pre-grabbed Draft units directly (per James: "new listings from grok and gemini will come into draft as well and pre grabbed as they enter")
$toDraft = !isset($_GET['sourcing_only']) && (($j['to_draft'] ?? null) !== false) && (($_GET['to_draft'] ?? '1') !== '0');
$res = sourcing_ingest($rows, $toDraft, 1);
json_out(['ok' => true, 'received' => count($rows), 'drafts_created' => count($res['draft_ids'] ?? [])] + $res);

