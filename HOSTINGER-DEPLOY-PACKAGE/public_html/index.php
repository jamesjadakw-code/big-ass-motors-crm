<?php
/**
 * Big Ass Motors · Unified CRM Command Center (Root)
 * Hostinger PHP 8.3 + MySQL PDO + React PWA (Zero Separate API Server)
 *
 * - Login Gate: Protected by crm_boot.php -> /inventory/login.php
 * - Data: Hydrated server-side from MySQL PDO (window.BAM_PDO_STATE) using new_build_state()
 * - Mutations: Standard PHP POST + CSRF (csrf_check())
 * - Mobile Command Center: iPhone 16 Pro Max PWA with Quick Deal Scraper,
 *   Dedicated Brochures Tab, JT20 Spec Engine, and Canonical 2-Page Brochures.
 */
declare(strict_types=1);
define('BAM_SITE', 'crm');
define('BAM_DOCROOT', __DIR__);

require_once __DIR__ . '/inventory/bam_locate.php';
require_once BAM_ROOT . '/inc/crm_boot.php';
require_once BAM_ROOT . '/inc/teamwork.php';
require_once BAM_ROOT . '/inc/inventory.php';
require_once BAM_ROOT . '/inc/settings.php';
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/state.php';

/** Database id of the email_drafts row a POST means: the id must belong to the same recipient (and unit when given), else the newest matching row. 0 = none. */
function bam_find_draft(array $p): int
{
    $id = (int) ($p['id'] ?? 0);
    $lead = (int) ($p['lead_id'] ?? 0);
    $unit = (int) ($p['inventory_id'] ?? 0);
    $to = trim((string) ($p['to_email'] ?? ''));
    if ($to === '') { return 0; }
    if ($id > 0) {
        $hit = q_val('SELECT id FROM email_drafts WHERE id = ? AND to_email = ?' . ($unit > 0 ? ' AND inventory_id = ?' : ''), $unit > 0 ? [$id, $to, $unit] : [$id, $to]);
        if ($hit) { return (int) $hit; }
    }
    if ($lead > 0) {
        $hit = q_val('SELECT id FROM email_drafts WHERE lead_id = ? AND to_email = ?' . ($unit > 0 ? ' AND inventory_id = ?' : '') . ' ORDER BY id DESC LIMIT 1', $unit > 0 ? [$lead, $to, $unit] : [$lead, $to]);
        if ($hit) { return (int) $hit; }
    }
    return 0;
}

/**
 * Saves one e-mail as a DRAFT in the signed-in rep's own Gmail (never sends). Needs the rep to have signed in with Google once
 * (tokens: inventory/google-tokens/, with the gmail.compose permission). Returns ['ok' => bool, 'url'|'error', 'needsLink'].
 * @param string[] $emails mailboxes to try, in order
 */
function bam_gmail_draft(array $emails, string $to, string $subject, string $body): array
{
    require_once __DIR__ . '/inventory/google-oauth.php';
    $access = null;
    foreach ($emails as $em) {
        if ($em !== '' && ($access = bam_google_valid_access_token($em))) { break; }
    }
    if (!$access) {
        return ['ok' => false, 'needsLink' => true, 'error' => 'Gmail is not linked yet. Sign in with Google once to link it.'];
    }
    $line = static fn (string $v): string => trim((string) preg_replace('/[\r\n]+/', ' ', $v));
    $raw = 'To: ' . $line($to) . "\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($line($subject)) . "?=\r\n"
         . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
         . preg_replace('/\r\n|\r|\n/', "\r\n", $body);
    $res = bam_google_http('https://gmail.googleapis.com/gmail/v1/users/me/drafts', [
        'method'  => 'POST',
        'headers' => ['Authorization: Bearer ' . $access, 'Content-Type: application/json'],
        'body'    => json_encode(['message' => ['raw' => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=')]]),
    ]);
    $code = (int) ($res['code'] ?? 0);
    if ($code >= 200 && $code < 300 && !empty($res['json']['id'])) {
        $mid = (string) ($res['json']['message']['id'] ?? '');
        return ['ok' => true, 'url' => 'https://mail.google.com/mail/u/0/#drafts' . ($mid !== '' ? '?compose=' . rawurlencode($mid) : '')];
    }
    $perm = in_array($code, [401, 403], true);
    error_log('[root index.php] gmail draft HTTP ' . $code);
    return ['ok' => false, 'needsLink' => $perm, 'error' => $perm
        ? 'Gmail did not allow drafts for this sign-in. Sign in with Google again and accept the Gmail draft permission.'
        : 'Gmail answered with an error (' . $code . '). Try again.'];
}

// ---------------- Handle Mutations via Standard PHP POST + CSRF ----------------
if (is_post()) {
    csrf_check();
    $do = (string) ($_POST['do'] ?? '');
    $payload = json_decode((string) ($_POST['payload'] ?? '{}'), true) ?: [];
    $uid = (int) ($ME['id'] ?? 0);

    try {
        switch ($do) {
            case 'save_unit':
                $unitId = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : null;
                $savedId = unit_save([
                    'stock_no'               => (string) ($payload['stock'] ?? ''),
                    'year'                   => isset($payload['year']) ? (int) $payload['year'] : null,
                    'make'                   => (string) ($payload['make'] ?? ''),
                    'model'                  => (string) ($payload['model'] ?? ''),
                    'category'               => (string) ($payload['category'] ?? ''),
                    'hours'                  => isset($payload['hours']) ? (int) $payload['hours'] : null,
                    'serial_vin'             => (string) ($payload['serial'] ?? ''),
                    'seller_cost_ask'        => isset($payload['askPrice']) ? (float) $payload['askPrice'] : null,
                    'public_price'           => isset($payload['listPrice']) ? (float) $payload['listPrice'] : null,
                    'unit_location_internal' => trim(($payload['city'] ?? '') . (($payload['state'] ?? '') ? ', ' . $payload['state'] : '')),
                    'description'            => (string) ($payload['narrative'] ?? ''),
                    'attachments'            => (string) ($payload['attachments'] ?? ''),
                    'source_url'             => (string) ($payload['sourceUrl'] ?? ''),
                    'status'                 => (string) ($payload['status'] ?? 'Draft'),
                ], $unitId, $uid, true);
                if (!empty($payload['confirm_active']) || !empty($payload['verified_at']) || !empty($payload['verifiedAt'])) {
                    q('UPDATE inventory SET verified_at = NOW(), updated_at = NOW() WHERE id = ?', [$savedId]);
                }
                if (isset($payload['status']) && $payload['status'] === 'Sold') {
                    q("UPDATE inventory SET status = 'Sold', sold_at = NOW(), updated_at = NOW() WHERE id = ?", [$savedId]);
                } elseif (isset($payload['status']) && $payload['status'] === 'Archived') {
                    q("UPDATE inventory SET status = 'Archived', archived_at = NOW(), updated_at = NOW() WHERE id = ?", [$savedId]);
                }
                if (is_file(BAM_ROOT . '/inc/hunter_hook.php')) {
                    require_once BAM_ROOT . '/inc/hunter_hook.php';
                    bam_hunter_on_unit_changed($savedId);
                }
                if (!empty($payload['media']) && is_array($payload['media'])) {
                    require_once BAM_ROOT . '/inc/images.php';
                    require_once BAM_ROOT . '/inc/fetch.php';
                    foreach (array_slice($payload['media'], 0, 15) as $photoUrl) {
                        if (preg_match('~^https?://~i', (string) $photoUrl)) {
                            try { download_unit_photo($savedId, (string) $photoUrl); } catch (Throwable) {}
                        }
                    }
                }
                audit('cockpit_unit_save', 'Saved unit #' . $savedId, 'unit', $savedId);
                break;

            case 'save_lead':
                $leadId = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : 0;
                $wants = is_array($payload['wants'] ?? null) ? $payload['wants'] : [];
                $make = trim((string) ($wants['make'] ?? ''));
                $model = trim((string) ($wants['model'] ?? ''));
                $cat = trim((string) ($wants['category'] ?? ''));
                $machine = trim("$make $model");
                if ($leadId > 0) {
                    q('UPDATE leads SET first_name = ?, last_name = ?, email = ?, phone = ?, company = ?, city = ?, state = ?, lead_status = ?, brand = ?, machine = ?, type = ?, message = ? WHERE id = ?', [
                        (string) ($payload['firstName'] ?? ''),
                        (string) ($payload['lastName'] ?? ''),
                        (string) ($payload['email'] ?? ''),
                        (string) ($payload['phone'] ?? ''),
                        (string) ($payload['company'] ?? ''),
                        (string) ($payload['city'] ?? ''),
                        (string) ($payload['state'] ?? ''),
                        (string) ($payload['stage'] ?? 'New'),
                        $make,
                        $machine,
                        $cat,
                        (string) ($payload['notes'] ?? ''),
                        $leadId,
                    ]);
                } else {
                    q('INSERT INTO leads (first_name, last_name, email, phone, company, city, state, lead_status, brand, machine, type, message, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [
                        (string) ($payload['firstName'] ?? ''),
                        (string) ($payload['lastName'] ?? ''),
                        (string) ($payload['email'] ?? ''),
                        (string) ($payload['phone'] ?? ''),
                        (string) ($payload['company'] ?? ''),
                        (string) ($payload['city'] ?? ''),
                        (string) ($payload['state'] ?? ''),
                        (string) ($payload['stage'] ?? 'New'),
                        $make,
                        $machine,
                        $cat,
                        (string) ($payload['notes'] ?? ''),
                    ]);
                    $leadId = (int) db()->lastInsertId();
                }
                audit('cockpit_lead_save', 'Saved lead #' . $leadId, 'lead', $leadId);
                break;

            case 'bulk_pitch':
                foreach (($payload['results'] ?? []) as $r) {
                    if (empty($r['ok'])) { continue; }
                    q("INSERT INTO email_drafts (kind, inventory_id, lead_id, to_email, to_name, subject, body, status, created_at) VALUES ('unit_match', ?, ?, ?, ?, ?, ?, 'Draft', NOW())", [
                        isset($payload['unitId']) && is_numeric($payload['unitId']) ? (int) $payload['unitId'] : null,
                        isset($r['leadId']) && is_numeric($r['leadId']) ? (int) $r['leadId'] : null,
                        (string) ($r['email'] ?? ''),
                        (string) ($r['name'] ?? ''),
                        mb_substr(trim((string) ($r['subject'] ?? '')), 0, 250) ?: 'BAM Official 2-Page Equipment Brochure',
                        mb_substr((string) ($r['body'] ?? ''), 0, 20000) ?: 'Queued from Hunter Cockpit Match Inbox',
                    ]);
                }
                audit('cockpit_bulk_pitch', 'Queued email_drafts for unit ' . ($payload['unitId'] ?? ''));
                break;

            case 'assign_lead':
                if (tw_on() && !empty($payload['leadId']) && !empty($payload['userId'])) {
                    q("INSERT INTO tw_assign (kind, item_id, user_id, assigned_by) VALUES ('lead', ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), assigned_by = VALUES(assigned_by), assigned_at = NOW()", [
                        (int) $payload['leadId'], (int) $payload['userId'], $uid,
                    ]);
                    audit('tw_assign', 'Assigned lead #' . (int) $payload['leadId'] . ' to user #' . (int) $payload['userId']);
                }
                break;

            case 'save_scraping_config':
                if (crm_can('admin', $ME)) {
                    $cid = isset($payload['id']) && is_numeric($payload['id']) && (int) $payload['id'] > 0 ? (int) $payload['id'] : null;
                    $website = trim((string) ($payload['website'] ?? 'facebook'));
                    $mfg = trim((string) ($payload['manufacturer'] ?? ''));
                    $model = trim((string) ($payload['model'] ?? ''));
                    $ymin = isset($payload['year_min']) && $payload['year_min'] !== '' && $payload['year_min'] !== null ? (int) $payload['year_min'] : null;
                    $ymax = isset($payload['year_max']) && $payload['year_max'] !== '' && $payload['year_max'] !== null ? (int) $payload['year_max'] : null;
                    $pmin = isset($payload['price_min']) && $payload['price_min'] !== '' && $payload['price_min'] !== null ? (int) $payload['price_min'] : null;
                    $pmax = isset($payload['price_max']) && $payload['price_max'] !== '' && $payload['price_max'] !== null ? (int) $payload['price_max'] : null;
                    $keywords = trim((string) ($payload['keywords'] ?? ''));
                    $active = isset($payload['active']) && ($payload['active'] === 0 || $payload['active'] === false || $payload['active'] === '0') ? 0 : 1;

                    if ($cid) {
                        q('UPDATE scraping_configs SET website = ?, manufacturer = ?, model = ?, year_min = ?, year_max = ?, price_min = ?, price_max = ?, keywords = ?, active = ?, updated_at = NOW() WHERE id = ?',
                            [$website, $mfg, $model, $ymin, $ymax, $pmin, $pmax, $keywords, $active, $cid]);
                        audit('scraping_config_save', "Updated watchlist #$cid ($mfg $model) on $website", 'scraping_configs', $cid);
                    } else {
                        q('INSERT INTO scraping_configs (website, manufacturer, model, year_min, year_max, price_min, price_max, keywords, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [$website, $mfg, $model, $ymin, $ymax, $pmin, $pmax, $keywords, $active]);
                        $cid = (int) db()->lastInsertId();
                        audit('scraping_config_create', "Created watchlist #$cid ($mfg $model) on $website", 'scraping_configs', $cid);
                    }
                }
                break;

            case 'delete_scraping_config':
                if (crm_can('admin', $ME) && !empty($payload['id'])) {
                    $cid = (int) $payload['id'];
                    q('DELETE FROM scraping_configs WHERE id = ?', [$cid]);
                    audit('scraping_config_delete', "Deleted watchlist #$cid", 'scraping_configs', $cid);
                }
                break;

            case 'save_draft':
            case 'update_draft':
                $did = bam_find_draft($payload);
                if ($did > 0) {
                    if ($do === 'save_draft') {
                        q("UPDATE email_drafts SET subject = ?, body = ? WHERE id = ? AND status = 'Draft'", [mb_substr(trim((string) ($payload['subject'] ?? '')), 0, 250), mb_substr((string) ($payload['body'] ?? ''), 0, 20000), $did]);
                        audit('email_draft_edit', 'Edited email draft #' . $did, 'email_drafts', $did);
                    } else {
                        $st = (string) ($payload['status'] ?? '');
                        if ($st === 'Sent') {
                            q("UPDATE email_drafts SET status = 'Sent', sent_marked_at = NOW() WHERE id = ?", [$did]);
                            try {
                                q("UPDATE unit_lead_matches m JOIN email_drafts d ON d.inventory_id = m.inventory_id AND d.lead_id = m.lead_id SET m.status = IF(m.status = 'Saved', 'Contacted', m.status), m.followup = '' WHERE d.id = ?", [$did]);
                            } catch (Throwable $e) { error_log('[root index.php] match status: ' . $e->getMessage()); }
                        } elseif (in_array($st, ['Draft', 'Discarded'], true)) {
                            q('UPDATE email_drafts SET status = ? WHERE id = ?', [$st, $did]);
                        }
                        audit('email_draft_status', 'Email draft #' . $did . ' -> ' . $st, 'email_drafts', $did);
                    }
                }
                break;

            case 'upload_photos':
                // Photos picked by a rep from their own computer/phone: saved through the CRM's normal photo store ($_FILES['photos']).
                $pUnit = isset($payload['unitId']) && is_numeric($payload['unitId']) ? (int) $payload['unitId'] : 0;
                if ($pUnit <= 0 || !q_one('SELECT id FROM inventory WHERE id = ?', [$pUnit])) { json_out(['ok' => false, 'error' => 'Unit not found'], 404); }
                require_once BAM_ROOT . '/inc/images.php';
                [$okP, $errP] = handle_photo_uploads($pUnit, 'photos');
                if ($okP > 0) {
                    try { require_once BAM_ROOT . '/inc/brochure.php'; brochure_attach_to_unit($pUnit, $ME['name'] ?? 'admin'); } catch (Throwable $e) { error_log('[root index.php] brochure after upload: ' . $e->getMessage()); }
                    if (is_file(BAM_ROOT . '/inc/hunter_hook.php')) {
                        try { require_once BAM_ROOT . '/inc/hunter_hook.php'; bam_hunter_on_unit_changed($pUnit); } catch (Throwable $e) { error_log('[root index.php] hunter after upload: ' . $e->getMessage()); }
                    }
                    audit('unit_photos_added', 'Added ' . $okP . ' photo(s) to unit #' . $pUnit, 'unit', $pUnit);
                }
                $pMedia = []; $pThumbs = [];
                foreach (q('SELECT inventory_id, filename, thumb, external_url, is_primary, sort_order FROM inventory_photos WHERE inventory_id = ? AND mirror_failed = 0 ORDER BY is_primary DESC, sort_order, id', [$pUnit])->fetchAll() as $pp) {
                    $full = photo_url($pp, false);
                    if ($full === '' || !preg_match('~^(https?://|/)~i', $full)) { continue; }
                    $pMedia[] = $full; $pThumbs[] = photo_url($pp, true) ?: $full;
                }
                json_out(['ok' => $okP > 0, 'added' => $okP, 'errors' => array_map('strval', $errP), 'media' => $pMedia, 'thumbs' => $pThumbs, 'error' => $okP > 0 ? null : (string) ($errP[0] ?? 'No photo was accepted')]);
                break;

            case 'gmail_draft':
                $did = bam_find_draft($payload);
                $row = $did > 0 ? q_one('SELECT id, to_email, subject, body FROM email_drafts WHERE id = ?', [$did]) : null;
                if (!$row) { json_out(['ok' => false, 'error' => 'Draft not found'], 404); }
                $gSubject = trim((string) ($payload['subject'] ?? '')) !== '' ? (string) $payload['subject'] : (string) $row['subject'];   // the rep's unsaved edits win
                $gBody = trim((string) ($payload['body'] ?? '')) !== '' ? (string) $payload['body'] : (string) $row['body'];
                $gEmails = array_values(array_unique(array_filter([strtolower(trim((string) ($_SESSION['gmail_tokens_email'] ?? ''))), strtolower(trim((string) ($ME['email'] ?? '')))])));
                $g = bam_gmail_draft($gEmails, (string) $row['to_email'], $gSubject, $gBody);
                if (!empty($g['ok'])) { audit('email_draft_gmail', 'Saved email draft #' . $did . ' to Gmail Drafts', 'email_drafts', $did); }
                json_out($g);
                break;

            case 'verify_unit':
                $vUnitId = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : 0;
                if ($vUnitId > 0 && crm_can('admin', $ME)) {
                    require_once BAM_ROOT . '/inc/verify_publish.php';
                    $r = bam_verify_publish($vUnitId, $ME);
                    json_out(['ok' => true] + $r);
                }
                break;

            case 'audit':
                audit(
                    (string) ($payload['event'] ?? 'event'),
                    (string) ($payload['detail'] ?? ''),
                    (string) ($payload['path'] ?? '/'),
                    isset($payload['item_id']) ? (int) $payload['item_id'] : null
                );
                break;
        }
    } catch (Throwable $e) {
        error_log('[root index.php] mutation error: ' . $e->getMessage());
    }
    json_out(['ok' => true]);
}

// ---------------- Hydrate State from MySQL PDO via new_build_state ----------------
$built = new_build_state($ME);
$state = $built['state'];

// Hydrate email_drafts and crm_audit into state
try {
    $state['email_drafts'] = q('SELECT id, kind, inventory_id, lead_id, to_email, to_name, subject, body, status, created_at FROM email_drafts ORDER BY id DESC LIMIT 100')->fetchAll();
} catch (Throwable) {}

try {
    $state['crm_audit'] = q('SELECT id, user_id, email, role, event, detail, path, ip, created_at FROM crm_audit ORDER BY id DESC LIMIT 150')->fetchAll();
} catch (Throwable) {}

$mePayload = [
    'id'    => (int) ($ME['id'] ?? 1),
    'email' => (string) ($ME['email'] ?? 'sales@bigassmotors.com'),
    'name'  => (string) ($ME['name'] ?: ($ME['email'] ?? 'James')),
    'role'  => crm_role($ME),
];
?><!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Big Ass Motors · CRM</title>
    <meta name="robots" content="noindex, nofollow" />
    <!-- iOS Web App & Standalone PWA Support (iPhone 16 Pro Max Optimized) -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="BAM CRM" />
    <meta name="theme-color" content="#0b0f19" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <script>
      window.BAM_ME = <?= json_encode($mePayload, JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_CSRF = <?= json_encode(csrf_token(), JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_PHP_ENDPOINT = <?= json_encode('/index.php', JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_PHP_BACK_URL = <?= json_encode('/inventory/inventory.php', JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_LOGOUT_URL = <?= json_encode('/inventory/logout.php', JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_HOSTINGER_BROCHURE_URL = <?= json_encode('/inventory/brochure.php', JSON_UNESCAPED_SLASHES) ?>;
      window.BAM_PDO_STATE = <?= json_encode($state, JSON_UNESCAPED_SLASHES) ?>;
    </script>
    <script type="module" crossorigin src="/assets/index-SQJOwBiT.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-BjIyp9K-.css">
  </head>
  <body class="bg-ink-950 text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-gold/30 selection:text-gold">
    <div id="root"></div>
  </body>
</html>
