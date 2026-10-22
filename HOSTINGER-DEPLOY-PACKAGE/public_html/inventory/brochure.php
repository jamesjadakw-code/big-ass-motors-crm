<?php
/**
 * CRM brochure generator.
 *   type=unit    → 2-page brochure per selected unit (same as public brochure.php)
 *   type=packet  → multi-unit packet: cover page + 2 pages per unit
 *   type=list    → list-form inventory sheet;  view=buyer (category/hours/price) | internal (+ location, seller, seller ask, status, source)
 *   ids=1,2,3 (or ids[]=…)  |  scope=live → every Live + Pending unit (full / updated inventory list)
 * Print → Save as PDF in the browser (add &print=1 to open the print dialog automatically).
 */
declare(strict_types=1);
require __DIR__ . '/bam.php';
require_once BAM_ROOT . '/inc/crm_boot.php';
require_once BAM_ROOT . '/inc/brochure.php';

$type = in_array($_GET['type'] ?? '', ['unit', 'packet', 'list'], true) ? $_GET['type'] : 'list';
$internal = $type === 'list' && ($_GET['view'] ?? '') === 'internal';
$raw = $_GET['ids'] ?? [];
$ids = array_values(array_unique(array_filter(array_map('intval', is_array($raw) ? $raw : explode(',', (string) $raw)))));
$category = (string) ($_GET['category'] ?? '');

if (($_GET['scope'] ?? '') === 'weekly') {
    $ids = weekly_list_ids();
    $scopeLabel = 'This week: new + reduced';
    if (!$ids) { flash('warn', 'No new or reduced units in the last 7 days.'); redirect('weekly.php'); }
    $_GET['title'] = $_GET['title'] ?? 'New & Reduced This Week — Big Ass Motors';
} elseif (($_GET['scope'] ?? '') === 'live' || !$ids) {
    $w = "status IN ('Live','Pending')"; $p = [];
    if ($category !== '') { $w .= ' AND category = ?'; $p[] = $category; }
    $ids = q("SELECT id FROM inventory WHERE $w ORDER BY category, make, model, year DESC", $p)->fetchAll(PDO::FETCH_COLUMN);
    $scopeLabel = 'Full inventory';
} else {
    $scopeLabel = 'Selected units';
}
$ids = array_map('intval', $ids);
if (!$ids) { flash('err', 'No units to include.'); redirect('inventory.php'); }
if ($type !== 'list' && count($ids) > 40) { flash('err', 'Brochures/packets are limited to 40 units at a time (' . count($ids) . ' selected). Use the inventory list for more.'); redirect('inventory.php'); }

$in = implode(',', array_fill(0, count($ids), '?'));
if ($internal) {
    $units = q("SELECT * FROM inventory WHERE id IN ($in)", $ids)->fetchAll();          // internal columns needed
} else {
    $units = array_values(array_filter(array_map(fn($id) => public_unit($id, true), $ids)));   // buyer-safe rows only
    $staged = count(array_filter($units, fn($u) => $u['status'] === 'Staged'));
    $units = array_values(array_filter($units, fn($u) => $u['status'] !== 'Staged'));        // Staged = hidden: never in buyer documents
    if ($staged) { flash('warn', "$staged Staged (hidden) unit(s) were left out of the buyer document."); }
    if (!$units) { flash('err', 'Staged units are hidden — buyer brochures/lists are not available for them (use the Internal list).'); redirect('inventory.php'); }
}
$order = array_flip($ids);
usort($units, fn($a, $b) => $order[(int) $a['id']] <=> $order[(int) $b['id']]);
$units = attach_primary_photos($units);
$drafts = count(array_filter($units, fn($u) => !in_array($u['status'], ['Live', 'Pending'], true)));
$today = date('M j, Y');

if ($type === 'list') {
    $cats = array_count_values(array_filter(array_map(fn($u) => category_label((string) $u['category']), $units)));
    arsort($cats);
    $catTxt = implode(' · ', array_map(fn($c, $n) => "$c ($n)", array_keys(array_slice($cats, 0, 5, true)), array_slice($cats, 0, 5, true)));
    $title = clean_text($_GET['title'] ?? '', 120) ?: ($category !== '' ? category_label($category) . ' — Available Now' : 'Big Ass Motors — Available Inventory');
    $sub1 = count($units) . (count($units) === 1 ? ' unit · ' : ' units · ') . $catTxt . ' · updated ' . $today;
    $sub2 = $internal
        ? 'INTERNAL: seller ask = seller cost/ask (never share); BAM price = public price. Location & seller are internal only. Buyer version: same list with view=buyer.'
        : 'Prices in USD, subject to prior sale. Escrow-friendly; freight arranged across the US & Mexico. Call ' . BAM_PHONE . ' for photos, walk-around videos and inspection reports.';
    brochure_doc_open(($internal ? 'INTERNAL ' : '') . 'Inventory list — ' . $today, url('inventory.php'));
    echo brochure_list($units, $title, $sub1, $sub2, $internal);
    brochure_doc_close();
    exit;
}

$singleUnitId = (count($units) === 1 && $type !== 'list') ? (int) $units[0]['id'] : null;

// Auto-attach brochure to listing documents for each unit generated
if ($type !== 'list') {
    foreach ($units as $u) {
        if (!empty($u['id'])) {
            $att = brochure_attach_to_unit((int) $u['id'], $ME['name'] ?? 'admin');
            // If direct download requested for single unit, stream the PDF straight to Downloads
            if ($singleUnitId && $singleUnitId === (int) $u['id'] && (isset($_GET['download']) || isset($_GET['dl']) || ($_GET['format'] ?? '') === 'pdf')) {
                if ($att['ok'] && is_file($att['path'])) {
                    header('Content-Type: application/pdf');
                    header('Content-Length: ' . filesize($att['path']));
                    header('Content-Disposition: attachment; filename="' . str_replace(['"', "\r", "\n"], '', $att['filename']) . '"');
                    header('Cache-Control: private, no-store');
                    header('X-Content-Type-Options: nosniff');
                    readfile($att['path']);
                    exit;
                }
            }
        }
    }
}

$docTitle = $type === 'packet' ? 'BAM packet — ' . count($units) . ' units' : 'BAM brochure' . (count($units) === 1 ? ' — ' . unit_title($units[0]) : 's — ' . count($units) . ' units');
brochure_doc_open($docTitle, url('inventory.php'), $singleUnitId);
if ($drafts) { echo '<div class="tb" style="background:#7f1d1d;position:static">Note: ' . $drafts . ' unit(s) are not Live — their public links will not work for buyers yet.</div>'; }
if ($type === 'packet') {
    $t = clean_text($_GET['title'] ?? '', 120) ?: 'Big Ass Motors — Equipment Available Now';
    echo brochure_cover($units, $t, count($units) . ' units ready to move · compiled ' . $today . ' · prices in USD, subject to prior sale');
    foreach ($units as $i => $u) { echo brochure_unit_pages($u, unit_photos((int) $u['id']), 2 + $i * 2); }
} else {
    foreach ($units as $u) { echo brochure_unit_pages($u, unit_photos((int) $u['id'])); }
}
brochure_doc_close();

