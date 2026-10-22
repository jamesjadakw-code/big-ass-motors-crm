<?php
/**
 * CRM roles + audit log (update_users v3).
 *   Admin  — James: everything.
 *   Sales  — works ONLY the leads assigned to them (Lead Desk, PHP lists, search, Today, board, API) — scoped server-side by the
 *            lead owner (tw_assign, update_teamwork). Inventory, invoices, sellers, sourcing as before. No exports, Settings, Users, Audit.
 *   Broker — everything EXCEPT: exports of any kind, Drive files / links, the full inventory list (inventory.php, weekly lists,
 *            internal / multi-unit brochures — single unit pages are fine), connectors / third-party integrations (Apify sourcing,
 *            URL import, AI specs, the Lead Desk Brain, Google Sheet / Gmail / Drive bridges) and Settings. Sees all leads.
 * Bulk exports (lead + inventory lists, the whole lead book, archives, private files) are Admin-only for every other role.
 * Every check is SERVER-SIDE and SILENT: non-admins simply do not get the options; a direct request answers 403 + an audit row.
 * The legacy role value 'staff' is Sales. Unknown values are treated as Sales (own leads only — fail closed).
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }

const CRM_ROLES = ['admin' => 'Admin', 'sales' => 'Sales', 'broker' => 'Broker'];
const CRM_ROLE_HELP = [
    'admin'  => 'James — everything.',
    'sales'  => 'Works only the leads assigned to them. Inventory, invoices, sellers, sourcing.',
    'broker' => 'All leads, units list and adding machines from URL. No exports, Drive, connectors or Settings.',
];

/**
 * Who may open which CRM page (basename under /inventory/) — [GET permission, POST permission]. See crm_can() for the meaning.
 * A page that is NOT listed is Admin-only (fail closed).
 */
const CRM_PAGE_PERMS = [
    'index.php' => ['', ''],                'inventory.php' => ['inventory_list', 'inventory_list'], 'unit.php' => ['', 'edit'],
    'cockpit.php' => ['', 'edit'],          'workspace/index.php' => ['', 'edit'],
    'weekly.php' => ['integrations', 'integrations'], 'brochure.php' => ['', ''], 'brochure_pdf.php' => ['', ''], 'ticker.php' => ['', ''],
    'inquiries.php' => ['', ''],            'finance.php' => ['', ''],              'matches.php' => ['all_leads', 'all_leads'],
    'leads.php' => ['', 'admin'],           'match.php' => ['export', 'all_leads'], 'account.php' => ['', ''],
    'unit_action.php' => ['edit', 'edit'],  'photo.php' => ['edit', 'edit'],       'add_url.php' => ['edit', 'edit'],
    'ai_specs.php' => ['integrations', 'integrations'], 'file.php' => ['export', 'export'], 'buyer_finder.php' => ['all_leads', 'all_leads'],
    'invoice.php' => ['', ''],              'outbox.php' => ['', ''],               'sourcing.php' => ['integrations', 'integrations'],
    'sellers.php' => ['', ''],              'export.php' => ['export', 'export'],
    'settings.php' => ['admin', 'admin'],   'users.php' => ['admin', 'admin'],      'audit.php' => ['admin', 'admin'],      'automations.php' => ['admin', 'admin'],
    'field_templates.php' => ['admin', 'admin'], 'import.php' => ['admin', 'admin'], 'import_template.php' => ['admin', 'admin'],
    'legacy.php' => ['admin', 'admin'],     'sync.php' => ['admin', 'admin'],       'mirror.php' => ['admin', 'admin'],
    'ai_batch.php' => ['admin', 'admin'],
    'my_settings.php' => ['', ''],
    'hub.php' => ['', 'admin'],   // update_hub3: Sales / Broker get the role-safe Hub (inc/hub_view.php); POST and every Hub write stay Admin-only
    // hub api
    'feed.php' => ['', ''],                 'queue_add.php' => ['edit', 'edit'],    'queue_step.php' => ['edit', 'edit'],
    'verify.php' => ['edit', 'edit'],       'price.php' => ['edit', 'edit'],        'bulk.php' => ['edit', 'edit'],
    // update_teamwork — item rules inside (inc/teamwork.php): Sales only reach their own leads
    'inbox.php' => ['', ''],                'tasks.php' => ['', ''],                'team_settings.php' => ['admin', 'admin'], 'activity.php' => ['admin', 'admin'],
];

function crm_role(?array $u): string
{
    $r = (string) ($u['role'] ?? '');
    if ($r === 'staff') { return 'sales'; }
    return isset(CRM_ROLES[$r]) ? $r : 'sales';
}

function crm_role_label(?array $u): string { return CRM_ROLES[crm_role($u)]; }

/**
 * admin | all_leads (Admin, Broker) | edit (everyone) | integrations (Admin, Sales: connectors, AI, Apify, URL import, Brain)
 * | inventory_list (Admin, Sales) | export | bulk_leads | drive | settings (Admin) | '' (any signed-in user)
 */
function crm_can(string $perm, ?array $u = null): bool
{
    $u = $u ?? current_user();
    if (!$u) { return false; }
    $r = crm_role($u);
    return match ($perm) {
        '', 'edit', 'inventory_list' => true,
        'admin', 'export', 'bulk_leads', 'drive', 'settings' => $r === 'admin',
        'all_leads' => $r !== 'sales',
        'integrations' => $r !== 'broker',
        default => false,
    };
}

/** Sales works only the leads assigned to them. */
function crm_own_leads_only(?array $u = null): bool { $u = $u ?? current_user(); return $u !== null && crm_role($u) === 'sales'; }

/** update_teamwork installed and its tables present? (shared pages degrade quietly without it) */
function tw_on(): bool { return function_exists('tw_ready') && tw_ready(); }

/** The permission a request to $page needs (query-specific rules for downloads / exports / internal lists). */
function crm_page_perm(string $page, array $get, bool $post): string
{
    $page = basename($page);
    $rule = CRM_PAGE_PERMS[$page] ?? ['admin', 'admin'];
    $perm = $post ? $rule[1] : $rule[0];
    if (!$post) {
        if (in_array($page, ['matches.php', 'match.php'], true) && isset($get['export'])) { $perm = 'export'; }
        if ($page === 'unit_action.php' && isset($get['archive'])) { $perm = 'export'; }
        if ($page === 'brochure.php' && ($get['view'] ?? '') === 'internal') { $perm = 'integrations'; }
        if ($page === 'weekly.php' && isset($get['view'])) { $perm = 'export'; }   // saved weekly list files
        if ($page === 'brochure.php' && brochure_is_bulk($get)) { $perm = 'export'; }   // multi-unit list / full inventory = bulk export
        if ($page === 'inventory.php' && isset($get['export'])) { $perm = 'export'; }
        // update_hub4: Inventory → URL LISTINGS tab (no query, or tab=url[&ul=&ulq=]) is open to every CRM role (Broker included);
        // the page itself shows Broker only verified URL listings + their own drafts. Every other inventory.php view still needs inventory_list.
        if ($page === 'inventory.php' && !array_diff(array_keys($get), ['tab', 'ul', 'ulq']) && (string) ($get['tab'] ?? 'url') === 'url') { $perm = ''; }
    }
    return $perm;
}

/** brochure.php request that renders MANY units (list / packet of several ids / scope=live|weekly|category) = bulk export. */
function brochure_is_bulk(array $get): bool
{
    if (($get['scope'] ?? '') !== '' || ($get['category'] ?? '') !== '') { return true; }
    $raw = $get['ids'] ?? [];
    $ids = array_filter(array_map('intval', is_array($raw) ? $raw : explode(',', (string) $raw)));
    return count(array_unique($ids)) > 1;
}

/** Can $u open this menu link (href like "inventory.php?status=Draft")? Used to build role-aware menus. */
function crm_link_allowed(array $u, string $href): bool
{
    $parts = parse_url($href);
    parse_str((string) ($parts['query'] ?? ''), $get);
    return crm_can(crm_page_perm((string) ($parts['path'] ?? ''), $get, false), $u);
}

/** Called by crm_boot.php for every /inventory/ page. */
function crm_page_guard(array $u): void
{
    $page = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $perm = crm_page_perm($page, $_GET, is_post());
    if (!crm_can($perm, $u)) {
        $what = (is_post() ? 'POST ' : 'GET ') . $page . (is_post() && isset($_POST['do']) ? ' do=' . mb_substr((string) $_POST['do'], 0, 40) : '')
              . ($_GET ? '?' . mb_substr(http_build_query(array_intersect_key($_GET, array_flip(['export', 'archive', 'view', 'type', 'dl', 'tab', 'go', 'scope']))), 0, 120) : '');
        crm_forbidden($what, $u);
    }
    crm_doc_activity_hook($page, $u);
}

/**
 * Activity feed for document pages WITHOUT touching those pages: after a successful POST (a redirect), log
 * invoice created (invoice.php … &done=<id>), listing created / edited + a new unit note (unit.php do=save), brochure sent.
 */
function crm_doc_activity_hook(string $page, array $u): void
{
    if (!is_post() || !in_array($page, ['invoice.php', 'unit.php', 'brochure.php'], true) || !tw_on()) { return; }
    $post = $_POST; $get = $_GET;
    register_shutdown_function(static function () use ($page, $u, $post, $get): void {
        $code = http_response_code();
        if ($code < 300 || $code >= 400) { return; }
        $loc = '';
        foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }
        $do = (string) ($post['do'] ?? '');
        $name = trim((string) ($post['title'] ?? '')) ?: trim(($post['year'] ?? '') . ' ' . ($post['make'] ?? '') . ' ' . ($post['model'] ?? ''));
        if ($page === 'invoice.php' && $do === 'create' && preg_match('~[?&]done=(\d+)~', $loc, $m)) {
            crm_activity('invoice_created', 'invoice #' . $m[1] . ' · unit #' . (int) ($get['unit'] ?? $post['unit'] ?? 0), 'inv', $m[1], $u);
        } elseif ($page === 'unit.php' && $do === 'save' && preg_match('~unit\.php\?id=(\d+)~', $loc, $m)) {
            $new = (int) ($get['id'] ?? 0) === 0;
            crm_activity($new ? 'listing_created' : 'listing_edited', ($post['stock_no'] ?? '') !== '' ? '#' . $post['stock_no'] . ' ' . $name : $name, 'unit', $m[1], $u);
            if (trim((string) ($post['note_new'] ?? '')) !== '') { crm_activity('note', mb_substr(trim((string) $post['note_new']), 0, 200), 'unit', $m[1], $u); }
        } elseif ($page === 'brochure.php') {
            crm_activity('brochure', 'brochure / price sheet', 'sys', '', $u);
        }
    });
}

/** 403 + audit row. JSON for API / fetch callers, a small page otherwise. */
function crm_forbidden(string $what, ?array $u = null, string $msg = ''): never
{
    $u = $u ?? current_user();
    audit('blocked', $what, $u);
    $msg = $msg !== '' ? $msg : 'This page is not available.';
    http_response_code(403);
    header('Cache-Control: no-store, private');
    $wantsJson = str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'json') || str_contains((string) ($_SERVER['SCRIPT_NAME'] ?? ''), '/api/')
              || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== '' || ($_SERVER['HTTP_SEC_FETCH_MODE'] ?? '') === 'cors';
    if ($wantsJson) { json_out(['ok' => false, 'error' => $msg, 'forbidden' => true], 403); }
    if (function_exists('crm_header') && $u) {
        crm_header('Not found', '');
        echo '<div class="panel" data-testid="forbidden"><div class="panel-b"><h2 style="margin-top:0">Nothing here</h2><p>' . h($msg) . '</p>'
           . '<p><a class="btn" href="' . h(url('index.php')) . '">← Dashboard</a></p></div></div>';
        crm_footer();
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $msg;
    }
    exit;
}

// ---------------------------------------------------------------- audit log (crm_audit table)
const AUDIT_EVENTS = [
    'login' => 'Logged in', 'login_failed' => 'Wrong password', 'login_throttled' => 'Log-in throttled', 'logout' => 'Logged out', 'session_idle' => 'Session timed out',
    'google_refused' => 'Google sign-in refused', 'google_failed' => 'Google sign-in failed',
    'blocked' => 'Blocked action (403)', 'rate_limited' => 'Lead viewing limit hit', 'volume_flag' => 'Unusual lead volume',
    'lead_view' => 'Lead list viewed', 'force_logout' => 'Forced log-out', 'session_ended' => 'Session ended (forced)',
    'user_added' => 'User added', 'user_changed' => 'User changed', 'user_disabled' => 'User disabled', 'user_enabled' => 'User enabled',
    'settings_roles' => 'Lead-volume flag changed', 'settings_team' => 'Team settings changed', 'tw_assign' => 'Leads assigned (bulk)',
];

function audit(string $event, string $detail = '', ?array $u = null, int $n = 0, ?string $email = null): void
{
    try {
        q('INSERT INTO crm_audit (user_id, email, role, event, detail, n, path, ip, ua) VALUES (?,?,?,?,?,?,?,?,?)', [
            $u ? (int) $u['id'] : null, mb_substr($email ?? (string) ($u['email'] ?? ''), 0, 190), $u ? crm_role($u) : '',
            mb_substr($event, 0, 40), mb_substr($detail, 0, 500), $n,
            mb_substr((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH), 0, 190), client_ip(),
            mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250)]);
        if (random_int(1, 200) === 1) { q('DELETE FROM crm_audit WHERE at < NOW() - INTERVAL 400 DAY'); }
    } catch (Throwable $e) {
        error_log('[BAM] audit write failed: ' . $e->getMessage());   // never break the page because of the log
    }
}

// ---------------------------------------------------------------- lead-volume watch (silent: logged + flagged, never refused)
function broker_flag_at(): int { return max(10, min(100000, (int) setting('broker_flag_at', '150'))); }

/** Page size for a lead list (same for every role since v3). */
function lead_page_size(int $default, ?array $u = null): int { return $default; }

/**
 * Call BEFORE showing $n lead rows. Non-admins: the same list (same $where) counts once per hour; the hourly total is flagged in the
 * audit log ("Unusual lead volume") at broker_flag_at(). Nothing is refused or shown to the user.
 */
function lead_view_gate(int $n, string $where, ?array $u = null): void
{
    $u = $u ?? current_user();
    if (!$u || $n <= 0 || crm_can('admin', $u)) { return; }
    $where = mb_substr($where, 0, 300);
    $uid = (int) $u['id'];
    if (q_val("SELECT id FROM crm_audit WHERE user_id = ? AND event = 'lead_view' AND detail = ? AND at > NOW() - INTERVAL 60 MINUTE LIMIT 1", [$uid, $where])) { return; }
    $sum = (int) q_val("SELECT IFNULL(SUM(n), 0) FROM crm_audit WHERE user_id = ? AND event = 'lead_view' AND at > NOW() - INTERVAL 60 MINUTE", [$uid]);
    audit('lead_view', $where, $u, $n);
    $flag = broker_flag_at();
    if ($sum < $flag && $sum + $n >= $flag && !q_val("SELECT id FROM crm_audit WHERE user_id = ? AND event = 'volume_flag' AND at > NOW() - INTERVAL 60 MINUTE LIMIT 1", [$uid])) {
        audit('volume_flag', ($sum + $n) . " leads viewed in 60 min (flag at $flag)", $u, $sum + $n);
    }
}

/** Activity feed writer (Admin → Activity). Quietly does nothing until update_teamwork's tables exist. */
function crm_activity(string $verb, string $detail = '', string $refType = 'sys', string $refKey = '', ?array $u = null): void
{
    if (!tw_on()) { return; }
    $u = $u ?? current_user();
    try { q('INSERT INTO tw_activity (user_id, ref_type, ref_key, verb, detail) VALUES (?,?,?,?,?)', [$u ? (int) $u['id'] : null, mb_substr($refType, 0, 8), mb_substr($refKey, 0, 64), mb_substr($verb, 0, 40), mb_substr($detail, 0, 500)]); }
    catch (Throwable $e) { error_log('[BAM] activity write failed: ' . $e->getMessage()); }
}

/** What the Lead Desk (React) needs to know about the signed-in user — injected into its HTML by app.php. No secrets. */
function crm_me_payload(array $u): array
{
    require_once __DIR__ . '/crm_menu.php';
    $menu = [];
    foreach (CRM_INVENTORY_MENU as $m) { if (crm_link_allowed($u, $m[1])) { $menu[] = $m[0]; } }
    $up = function_exists('user_prefs') ? user_prefs((int) $u['id']) : null;
    return ['id' => (int) $u['id'], 'email' => (string) $u['email'], 'name' => (string) $u['name'], 'role' => crm_role($u),
            'perms' => ['admin' => crm_can('admin', $u), 'export' => crm_can('export', $u), 'bulkLeads' => crm_can('bulk_leads', $u), 'edit' => true,
                        'allLeads' => crm_can('all_leads', $u), 'integrations' => crm_can('integrations', $u), 'inventoryList' => crm_can('inventory_list', $u), 'settings' => crm_can('settings', $u)],
            'links' => ['account' => 'account.php', 'logout' => 'logout.php', 'csrf' => csrf_token(), 'mySettings' => 'my_settings.php'] + (crm_can('admin', $u) ? ['users' => 'users.php', 'audit' => 'audit.php', 'settings' => 'settings.php'] : []),
            'menu' => $menu, 'pageSize' => 200,
            'prefs' => $up,
            'team' => tw_on() ? ['on' => true, 'canAssign' => tw_can_assign($u), 'bulkAssign' => crm_can('admin', $u), 'admin' => crm_can('admin', $u)] : ['on' => false]];
}

// update_teamwork: team features (assignment, messages, tasks …) — loaded with the roles so every page / API can scope by owner
if (is_file(__DIR__ . '/teamwork.php')) { require_once __DIR__ . '/teamwork.php'; }
