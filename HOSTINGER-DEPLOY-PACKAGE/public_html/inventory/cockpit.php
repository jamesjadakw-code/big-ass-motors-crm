<?php
/**
 * BAM CRM — Unified Zero-API Hunter Cockpit (Hostinger PHP + MySQL PDO)
 *
 * Bridges the Hostinger PHP + MySQL PDO Multi-User CRM (`inventory`, `leads`, `users`, `email_drafts`, `crm_audit`, `tw_tasks`, `tw_assign`)
 * directly into the Hunter Cockpit UI (`Today`, `Match Inbox`, `Leads`, `Board`, `Inventory`, `Add From Listing`, `Users & Audit`, `Settings`)
 * with ZERO separate Node/Express API server.
 *
 * - Login: Protected by `crm_boot.php` -> `/inventory/login.php` (E-mail & password + Google Sign-In on the access list).
 * - Data: Hydrated server-side from MySQL through PDO (`q()`) and mutated via standard PHP POST + CSRF (`csrf_check()`).
 * - Multi-user: Scopes leads for `sales` role via `tw_assign`, logs all actions to `crm_audit`, and queues pitches to `email_drafts`.
 */
declare(strict_types=1);
require __DIR__ . '/bam.php';

require_once BAM_ROOT . '/inc/crm_boot.php';

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
                if ($leadId > 0) {
                    q('UPDATE leads SET first_name = ?, last_name = ?, email = ?, phone = ?, company = ?, city = ?, state = ?, lead_status = ?, budget_max = ?, max_hours = ?, equip_type = ?, target_equipment = ?, notes = ? WHERE id = ?', [
                        (string) ($payload['firstName'] ?? ''),
                        (string) ($payload['lastName'] ?? ''),
                        (string) ($payload['email'] ?? ''),
                        (string) ($payload['phone'] ?? ''),
                        (string) ($payload['company'] ?? ''),
                        (string) ($payload['city'] ?? ''),
                        (string) ($payload['state'] ?? ''),
                        (string) ($payload['stage'] ?? 'New'),
                        isset($payload['budgetMax']) ? (float) $payload['budgetMax'] : null,
                        isset($payload['maxHours']) ? (int) $payload['maxHours'] : null,
                        (string) ($wants['category'] ?? ''),
                        trim(($wants['make'] ?? '') . ' ' . ($wants['model'] ?? '')),
                        (string) ($payload['notes'] ?? ''),
                        $leadId,
                    ]);
                } else {
                    q('INSERT INTO leads (first_name, last_name, email, phone, company, city, state, lead_status, budget_max, max_hours, equip_type, target_equipment, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                        (string) ($payload['firstName'] ?? ''),
                        (string) ($payload['lastName'] ?? ''),
                        (string) ($payload['email'] ?? ''),
                        (string) ($payload['phone'] ?? ''),
                        (string) ($payload['company'] ?? ''),
                        (string) ($payload['city'] ?? ''),
                        (string) ($payload['state'] ?? ''),
                        (string) ($payload['stage'] ?? 'New'),
                        isset($payload['budgetMax']) ? (float) $payload['budgetMax'] : null,
                        isset($payload['maxHours']) ? (int) $payload['maxHours'] : null,
                        (string) ($wants['category'] ?? ''),
                        trim(($wants['make'] ?? '') . ' ' . ($wants['model'] ?? '')),
                        (string) ($payload['notes'] ?? ''),
                    ]);
                    $leadId = (int) db()->lastInsertId();
                }
                audit('cockpit_lead_save', 'Saved lead #' . $leadId, 'lead', $leadId);
                break;

            case 'bulk_pitch':
                foreach (($payload['results'] ?? []) as $r) {
                    if (empty($r['ok'])) { continue; }
                    q("INSERT INTO email_drafts (kind, inventory_id, lead_id, to_email, to_name, subject, body, status) VALUES ('unit_match', ?, ?, ?, ?, ?, ?, 'Draft')", [
                        isset($payload['unitId']) && is_numeric($payload['unitId']) ? (int) $payload['unitId'] : null,
                        isset($r['leadId']) && is_numeric($r['leadId']) ? (int) $r['leadId'] : null,
                        (string) ($r['email'] ?? ''),
                        (string) ($r['name'] ?? ''),
                        'BAM Official 2-Page Equipment Brochure',
                        'Queued from Hunter Cockpit Match Inbox',
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

            case 'save_user':
                if (crm_can('admin', $ME) && !empty($payload['email'])) {
                    $em = mb_strtolower(trim((string) $payload['email']));
                    $role = in_array($payload['role'] ?? '', ['admin', 'sales', 'broker'], true) ? $payload['role'] : 'sales';
                    $ex = q_one('SELECT id FROM users WHERE email = ?', [$em]);
                    if ($ex) {
                        q('UPDATE users SET name = ?, role = ?, active = ?, google_allowed = ? WHERE id = ?', [
                            (string) ($payload['name'] ?? ''), $role, !empty($payload['active']) ? 1 : 0, !empty($payload['google_allowed']) ? 1 : 0, (int) $ex['id'],
                        ]);
                    }
                    audit('user_updated', 'Updated user ' . $em . ' (' . $role . ')');
                }
                break;

            case 'delete_user':
                if (crm_can('admin', $ME) && !empty($payload['id'])) {
                    q('DELETE FROM users WHERE id = ? AND email != ?', [(int) $payload['id'], 'sales@bigassmotors.com']);
                    audit('user_deleted', 'Deleted user #' . (int) $payload['id'] . ' (' . ($payload['email'] ?? '') . ')');
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
                    $keywords = trim((string) ($payload['keywords'] ?? '')) ?: null;
                    $active = isset($payload['active']) && ($payload['active'] === 0 || $payload['active'] === false || $payload['active'] === '0') ? 0 : 1;

                    if ($cid) {
                        q('UPDATE scraping_configs SET website = ?, manufacturer = ?, model = ?, year_min = ?, year_max = ?, price_min = ?, price_max = ?, keywords = ?, active = ?, updated_at = NOW() WHERE id = ?',
                            [$website, $mfg, $model, $ymin, $ymax, $pmin, $pmax, $keywords, $active, $cid]);
                        audit('scraping_config_save', "Updated watchlist #$cid ($mfg $model) on $website", 'scraping_configs', $cid);
                    } else {
                        q('INSERT INTO scraping_configs (website, manufacturer, model, year_min, year_max, price_min, price_max, keywords, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
                            [$website, $mfg, $model, $ymin, $ymax, $pmin, $pmax, $keywords, $active, $uid]);
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

            case 'verify_unit':
                $vUnitId = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : 0;
                if ($vUnitId > 0 && crm_can('admin', $ME)) {
                    require_once BAM_ROOT . '/inc/verify_publish.php';
                    $r = bam_verify_publish($vUnitId, $ME);
                    json_out(['ok' => true] + $r);
                }
                break;
        }
    } catch (Throwable $e) {
        error_log('cockpit POST error: ' . $e->getMessage());
    }
    json_out(['ok' => true]);
}

// (Removed: a block here reset James's and Matt's passwords to fixed values and deleted users on every page load.
// Accounts and passwords are managed only in Users & roles.)

// ---------------- Hydrate State from MySQL PDO (`inventory`, `leads`, `users`, `email_drafts`, `crm_audit`) ----------------
$pdoUnits = [];
try {
    foreach (q("SELECT * FROM inventory WHERE status NOT IN ('Archived') ORDER BY updated_at DESC, id DESC LIMIT 250")->fetchAll() as $r) {
        $locParts = array_map('trim', explode(',', (string) ($r['unit_location_internal'] ?: $r['seller_location'] ?? '')));
        $pdoUnits[] = [
            'id'              => (string) $r['id'],
            'stock'           => (string) ($r['stock_no'] ?: ('BAM-' . $r['id'])),
            'year'            => $r['year'] ? (int) $r['year'] : null,
            'make'            => (string) ($r['make'] ?? ''),
            'model'           => (string) ($r['model'] ?? ''),
            'category'        => (string) ($r['category'] ?? ''),
            'hours'           => $r['hours'] !== null ? (int) $r['hours'] : null,
            'serial'          => (string) ($r['serial_vin'] ?? ''),
            'askPrice'        => $r['seller_cost_ask'] !== null ? (float) $r['seller_cost_ask'] : null,
            'listPrice'       => $r['public_price'] !== null ? (float) $r['public_price'] : null,
            'buyPrice'        => $r['seller_cost_ask'] !== null ? (float) $r['seller_cost_ask'] : null,
            'city'            => $locParts[0] ?? '',
            'state'           => $locParts[1] ?? '',
            'status'          => in_array($r['status'], ['Live', 'Sold'], true) ? $r['status'] : 'Draft',
            'narrative'       => (string) ($r['description'] ?? ''),
            'attachments'     => (string) ($r['attachments'] ?? ''),
            'sourceUrl'       => (string) ($r['source_url'] ?? ''),
            'verified'        => !empty($r['verified_at']),
            'media'           => (function() use ($r) {
                try {
                    return array_values(array_filter(array_map(fn($ph) => photo_url($ph), unit_photos((int) $r['id']))));
                } catch (Throwable) { return []; }
            })(),
            'oemSpecs'        => [],
            'pendingFields'   => [],
        ];
    }
} catch (Throwable) {}

$pdoLeads = [];
try {
    $leadSql = crm_own_leads_only($ME) && tw_on()
        ? 'SELECT l.*, a.user_id AS owner_id FROM leads l INNER JOIN tw_assign a ON a.kind = \'lead\' AND a.item_id = l.id AND a.user_id = ? ORDER BY l.updated_at DESC LIMIT 300'
        : 'SELECT l.*, NULL AS owner_id FROM leads l ORDER BY l.updated_at DESC LIMIT 300';
    $leadArgs = crm_own_leads_only($ME) && tw_on() ? [(int) $ME['id']] : [];
    foreach (q($leadSql, $leadArgs)->fetchAll() as $l) {
        $pdoLeads[] = [
            'id'           => (string) $l['id'],
            'firstName'    => (string) ($l['first_name'] ?? ''),
            'lastName'     => (string) ($l['last_name'] ?? ''),
            'email'        => (string) ($l['email'] ?? ''),
            'phone'        => (string) ($l['phone'] ?? ''),
            'company'      => (string) ($l['company'] ?? ''),
            'city'         => (string) ($l['city'] ?? ''),
            'state'        => (string) ($l['state'] ?? ''),
            'stage'        => in_array($l['lead_status'] ?? '', ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'], true) ? $l['lead_status'] : 'New',
            'urgency'      => (string) ($l['urgency'] ?: 'Medium'),
            'language'     => 'en',
            'budgetMax'    => $l['budget_max'] !== null ? (float) $l['budget_max'] : null,
            'maxHours'     => $l['max_hours'] !== null ? (int) $l['max_hours'] : null,
            'ownerId'      => (int) ($l['owner_id'] ?: $ME['id']),
            'ownerName'    => (string) ($ME['name'] ?: $ME['email']),
            'notes'        => (string) ($l['notes'] ?? ''),
            'wants'        => [
                'category' => (string) ($l['equip_type'] ?? ''),
                'model'    => (string) ($l['target_equipment'] ?? ''),
            ],
            'interactions' => [],
        ];
    }
} catch (Throwable) {}

$pdoUsers = [];
try {
    foreach (q('SELECT id, email, name, role, active, google_allowed, last_login_at, last_login_via FROM users ORDER BY id')->fetchAll() as $u) {
        $pdoUsers[] = $u;
    }
} catch (Throwable) {}

$pdoDrafts = [];
try {
    foreach (q('SELECT id, kind, inventory_id, lead_id, to_email, to_name, subject, body, status, created_at FROM email_drafts ORDER BY id DESC LIMIT 80')->fetchAll() as $d) {
        $pdoDrafts[] = $d;
    }
} catch (Throwable) {}

$pdoAudit = [];
try {
    foreach (q('SELECT id, user_id, email, role, event, detail, path, ip, created_at FROM crm_audit ORDER BY id DESC LIMIT 120')->fetchAll() as $a) {
        $pdoAudit[] = $a;
    }
} catch (Throwable) {}

$pdoScrapingConfigs = [];
try {
    $pdoScrapingConfigs = q('SELECT id, website, manufacturer, model, year_min, year_max, price_min, price_max, keywords, active, created_by, created_at, updated_at FROM scraping_configs ORDER BY id')->fetchAll();
} catch (Throwable) {}

$pdoState = [
    'inventory'        => $pdoUnits,
    'leads'            => $pdoLeads,
    'users'            => $pdoUsers,
    'email_drafts'     => $pdoDrafts,
    'crm_audit'        => $pdoAudit,
    'scraping_configs' => $pdoScrapingConfigs,
    'tasks'            => [],
    'matches'          => [],
];
?><!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Hunter Cockpit · BAM CRM</title>
  <link rel="icon" href="<?= h(asset('img/favicon.png')) ?>">
  <?php
    $bamJsPath = __DIR__ . '/cockpit-assets/cockpit.js';
    $bamCssPath = __DIR__ . '/cockpit-assets/cockpit.css';
    $bamV = '?v=' . (@file_exists($bamJsPath) ? filemtime($bamJsPath) : time());
  ?>
  <link rel="stylesheet" href="<?= h(url('cockpit-assets/cockpit.css' . $bamV)) ?>">
  <script>
    window.BAM_ME = <?= json_encode([
        'id'    => (int) ($ME['id'] ?? 1),
        'email' => (string) ($ME['email'] ?? 'sales@bigassmotors.com'),
        'name'  => (string) ($ME['name'] ?: ($ME['email'] ?? 'James')),
        'role'  => crm_role($ME),
    ], JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_CSRF = <?= json_encode(csrf_token(), JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_PHP_ENDPOINT = <?= json_encode(url('cockpit.php'), JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_PHP_BACK_URL = <?= json_encode(url('inventory.php'), JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_LOGOUT_URL = <?= json_encode(url('logout.php'), JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_HOSTINGER_BROCHURE_URL = <?= json_encode(url('brochure.php'), JSON_UNESCAPED_SLASHES) ?>;
    window.BAM_PDO_STATE = <?= json_encode($pdoState, JSON_UNESCAPED_SLASHES) ?>;
  </script>
  <script type="module" crossorigin src="<?= h(url('cockpit-assets/cockpit.js' . $bamV)) ?>"></script>
</head>
<body class="bg-ink-900 text-neutral-100 antialiased selection:bg-bam selection:text-black">
  <div id="root"></div>
</body>
</html>
