<?php
/**
 * ONE definition of the CRM "Inventory" menu section, used by the PHP Inventory pages' side menu (layout_crm.php)
 * and served to the Lead Desk (api/menu.php → counts; the React side menu carries the same list, checked by tests/e2e_menu.py).
 * Each item: [key, href, label, icon, group, spa view id].
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }

const CRM_INVENTORY_MENU = [
    ['cockpit',     'cockpit.php',         'Hunter Cockpit',      '🎯', 'Workspace', 'cockpit'],
    ['workspace',   'workspace/index.php', 'Match Workspace',     '◎', 'Workspace', 'workspace'],
    ['dashboard',   'index.php',           'Dashboard',           '📊', 'Workspace', 'invdash'],
    ['inventory',   'inventory.php',       'All Units',           '🚜', 'Units',     'inventory'],
    ['new',         'unit.php',            'Add Machine',         '➕', 'Units',     'addunit'],
    ['addurl',      'add_url.php',         'Add from URL',        '🔗', 'Units',     'addurl'],
    ['matches',     'matches.php',         'Buyer Matches',       '🤝', 'Buyers',    'matches'],
    ['leads',       'leads.php',           'Leads Database',      '👥', 'Buyers',    'invleads'],
    ['import',      'import.php',          'Import CSV',          '📥', 'System',    'import'],
    ['export',      'export.php',          'Export CSV',          '⬇️', 'System',    'export'],
    ['settings',    'settings.php',        'Settings',            '⚙️', 'System',    'invsettings'],
];

/** Badge numbers for the menu (key → int). Each query is guarded so a missing table never breaks the menu. */
function crm_menu_counts(): array
{
    $one = function (string $sql): ?int { try { return (int) q_val($sql); } catch (Throwable) { return null; } };
    return array_filter([
        'inventory' => $one("SELECT COUNT(*) FROM inventory WHERE status NOT IN ('Archived','Staged')"),
        'review'    => $one("SELECT COUNT(*) FROM inventory WHERE status = 'Draft' AND submitted_via = 'seller_portal'"),
        'inquiries' => $one("SELECT COUNT(*) FROM inquiries WHERE status = 'New'"),
        'finance'   => $one("SELECT COUNT(*) FROM finance_requests WHERE status = 'New'"),
        'leads'     => $one('SELECT COUNT(*) FROM leads'),
        'sellers'   => $one('SELECT COUNT(*) FROM sellers'),
        'outbox'    => $one("SELECT COUNT(*) FROM email_drafts WHERE status = 'Draft'"),
    ], fn ($v) => $v !== null);
}

/** Pick-a-unit screen for pages that need one (Buyer finder, Create invoice) when opened from the menu. */
function crm_unit_picker(string $page, string $title, string $active, string $blurb): void
{
    $qq = trim((string) ($_GET['q'] ?? ''));
    $where = "status IN ('Live','Pending','Draft')"; $args = [];
    if ($qq !== '') {
        $where .= ' AND (stock_no LIKE ? OR make LIKE ? OR model LIKE ? OR CONCAT_WS(\' \', year, make, model) LIKE ?)';
        $like = '%' . $qq . '%'; $args = [$like, $like, $like, $like];
    }
    $rows = q("SELECT id, stock_no, year, make, model, status FROM inventory WHERE $where ORDER BY updated_at DESC, id DESC LIMIT 40", $args)->fetchAll();
    crm_header($title, $active, ['pill' => 'pick a unit']);
    echo '<div class="panel"><div class="panel-b"><p class="hint">' . h($blurb) . '</p>'
       . '<form class="filters" method="get"><input name="q" value="' . h($qq) . '" placeholder="Stock #, make, model…" autofocus data-testid="unit-picker-q"><button class="btn">Search</button></form>'
       . '<table class="tbl mt" data-testid="unit-picker"><thead><tr><th>Stock #</th><th>Unit</th><th>Status</th><th></th></tr></thead><tbody>';
    foreach ($rows as $r) {
        echo '<tr><td>' . h((string) $r['stock_no']) . '</td><td>' . h(trim($r['year'] . ' ' . $r['make'] . ' ' . $r['model'])) . '</td><td>' . status_pill((string) $r['status'])
           . '</td><td><a class="btn btn-sm btn-y" href="' . h(url($page . '?unit=' . (int) $r['id'])) . '">Open</a></td></tr>';
    }
    if (!$rows) { echo '<tr><td colspan="4" class="muted">No units match.</td></tr>'; }
    echo '</tbody></table></div></div>';
    crm_footer();
    exit;
}
