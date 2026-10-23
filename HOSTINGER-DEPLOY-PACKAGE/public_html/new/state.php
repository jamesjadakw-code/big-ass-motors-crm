<?php
/**
 * /new/ read-only connector: loads what the signed-in user may see from MySQL (PDO, prepared statements only)
 * and returns the state object the React CRM hydrates from. Nothing here writes.
 */
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
// Model-specific OEM reference specs (same knowledge base the live brochures use), only when the app folder has it.
if (defined('BAM_ROOT') && is_file(BAM_ROOT . '/inc/oem_specs.php')) { require_once BAM_ROOT . '/inc/oem_specs.php'; }

const NEW_MAX_UNITS = 1000;
const NEW_MAX_LEADS = 3000;

/** @return array{state: array, counts: array} */
function new_build_state(array $me): array
{
    $isAdmin = crm_can('admin', $me);
    $uid = (int) $me['id'];

    // ---- users (admins get the team list; everyone else only sees names, never emails or logins) ----
    $userRows = [];
    try {
        $userRows = q('SELECT id, email, name, role, is_active, google_allowed, last_login_at, last_login_method FROM users ORDER BY id')->fetchAll();
    } catch (Throwable $e) { error_log('[new] users: ' . $e->getMessage()); }
    $ownerNames = [];
    foreach ($userRows as $u) { $ownerNames[(int) $u['id']] = new_str($u['name'] ?: $u['email'], 120); }
    $users = $isAdmin
        ? array_map('new_map_user', $userRows)
        : array_map(static fn ($u) => ['id' => (int) $u['id'], 'name' => new_str($u['name'], 120), 'role' => 'sales', 'active' => 1], $userRows);

    // ---- inventory + photos (photo_url() from inc/inventory.php, so server uploads and hot-linked photos both work) ----
    $units = [];
    try {
        $rows = q("SELECT * FROM inventory WHERE status <> 'Archived' ORDER BY updated_at DESC, id DESC LIMIT " . NEW_MAX_UNITS)->fetchAll();
        $byUnit = [];
        if ($rows) {
            $ids = array_map(static fn ($r) => (int) $r['id'], $rows);
            $in = implode(',', array_fill(0, count($ids), '?'));
            foreach (q("SELECT inventory_id, filename, thumb, external_url, is_primary, sort_order FROM inventory_photos WHERE inventory_id IN ($in) AND mirror_failed = 0 ORDER BY is_primary DESC, sort_order, id", $ids)->fetchAll() as $p) {
                $byUnit[(int) $p['inventory_id']][] = $p;
            }
        }
        foreach ($rows as $r) {
            $oem = null;
            if (function_exists('oem_specs_for_unit')) {
                try { $oem = oem_specs_for_unit(['make' => $r['make'] ?? '', 'model' => $r['model'] ?? '', 'category' => $r['category'] ?? '', 'title' => $r['title'] ?? '', 'year' => $r['year'] ?? '']); }
                catch (Throwable $e) { $oem = null; }
            }
            $units[] = new_map_unit($r, $byUnit[(int) $r['id']] ?? [], 'photo_url', $isAdmin, $oem);
        }
    } catch (Throwable $e) { error_log('[new] inventory: ' . $e->getMessage()); }

    // ---- leads: sales reps only get the leads assigned to them (tw_assign), exactly like leads.php ----
    $leads = [];
    try {
        [$scope, $scopeArgs] = tw_scope_sql($me, 'db', 'l.id');
        $leadRows = q('SELECT l.* FROM leads l WHERE 1 = 1' . $scope . ' ORDER BY l.updated_at DESC, l.id DESC LIMIT ' . NEW_MAX_LEADS, $scopeArgs)->fetchAll();
        $owners = [];
        if ($leadRows && tw_on()) {
            foreach (q("SELECT CAST(SUBSTRING(lead_key, 4) AS UNSIGNED) AS lead_id, user_id FROM tw_assign WHERE lead_key LIKE 'db:%'")->fetchAll() as $a) {
                $owners[(int) $a['lead_id']] = (int) $a['user_id'];
            }
        }
        foreach ($leadRows as $r) {
            $leads[] = new_map_lead($r, $owners[(int) $r['id']] ?? null, $ownerNames);
        }
    } catch (Throwable $e) { error_log('[new] leads: ' . $e->getMessage()); }

    // ---- tasks (Team Work): own tasks; admins see all open ones ----
    $tasks = [];
    try {
        if (tw_on()) {
            $sql = "SELECT * FROM tw_tasks WHERE status = 'open'" . ($isAdmin ? '' : ' AND assignee_id = ?') . ' ORDER BY due_at IS NULL, due_at LIMIT 500';
            foreach (q($sql, $isAdmin ? [] : [$uid])->fetchAll() as $r) { $tasks[] = new_map_task($r); }
        }
    } catch (Throwable $e) { error_log('[new] tasks: ' . $e->getMessage()); }

    // ---- saved Settings (features + look) live in the shared settings table once Save is enabled ----
    $config = ['company' => 'Big Ass Motors LLC'];
    foreach (['features' => 'new_features', 'look' => 'new_look'] as $k => $skey) {
        $raw = function_exists('setting') ? setting($skey, '') : '';
        $v = $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($v)) { $config[$k] = $v; }
    }

    return [
        'state'  => [
            'config' => $config, 'users' => $users, 'leads' => $leads, 'inventory' => $units,
            'tasks' => $tasks, 'matches' => [], 'email_drafts' => [], 'crm_audit' => [],
        ],
        'counts' => ['units' => count($units), 'leads' => count($leads), 'tasks' => count($tasks), 'users' => count($users)],
    ];
}
