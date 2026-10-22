<?php
/**
 * Listing options: machine-type field templates, promo banners, private notes, Buyer Finder, Sold / Archive / List Now.
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }
require_once __DIR__ . '/automations.php';
require_once __DIR__ . '/matching.php';
require_once __DIR__ . '/automation.php';

const PROMO_COLORS = ['yellow' => ['#FFC107', '#141414', 'BAM yellow'], 'red' => ['#DC2626', '#ffffff', 'Red'], 'green' => ['#16A34A', '#ffffff', 'Green'],
    'blue' => ['#2563EB', '#ffffff', 'Blue'], 'black' => ['#141414', '#FFC107', 'Black']];
const PROMO_PRESETS = ['Just Arrived', 'Reduced', 'Hot Deal', 'Low Hours', 'Financing Available', 'Must Go', 'New Arrival'];
const FIELD_TYPES = ['text' => 'Text', 'yesno' => 'Yes / No', 'select' => 'Pick list', 'number' => 'Number / %'];

/** Default templates (editable in CRM → Field templates). A field whose key is undercarriage_pct / tires_pct uses the built-in column. */
function field_templates_default(): array
{
    return [
        'Dozers' => [['key' => 'ripper', 'label' => 'Ripper', 'type' => 'select', 'options' => ['None', 'Single shank', 'Multi shank']],
            ['key' => 'winch', 'label' => 'Winch', 'type' => 'yesno', 'options' => []],
            ['key' => 'blade_type', 'label' => 'Blade type', 'type' => 'select', 'options' => ['PAT / 6-way', 'Straight (S)', 'Semi-U (SU)', 'Universal (U)', 'Angle']],
            ['key' => 'undercarriage_pct', 'label' => 'Undercarriage %', 'type' => 'number', 'options' => []],
            ['key' => 'cab_rops', 'label' => 'Cab / ROPS', 'type' => 'select', 'options' => ['Enclosed cab', 'Open ROPS', 'Cab with A/C']]],
        'Excavators' => [['key' => 'thumb', 'label' => 'Thumb', 'type' => 'select', 'options' => ['None', 'Hydraulic', 'Manual', 'Progressive link']],
            ['key' => 'coupler', 'label' => 'Coupler', 'type' => 'select', 'options' => ['Pin-on', 'Hydraulic quick coupler', 'Manual quick coupler']],
            ['key' => 'aux_hydraulics', 'label' => 'Aux hydraulics', 'type' => 'yesno', 'options' => []]],
        'Backhoes' => [['key' => 'extendahoe', 'label' => 'Extendahoe', 'type' => 'yesno', 'options' => []],
            ['key' => '4wd', 'label' => '4WD', 'type' => 'yesno', 'options' => []],
            ['key' => 'pilot_controls', 'label' => 'Pilot controls', 'type' => 'yesno', 'options' => []]],
        'Trenchers & Rock Saws' => [['key' => 'attachment', 'label' => 'Attachment', 'type' => 'select', 'options' => ['Trencher boom', 'Rock saw', 'Plow', 'Microtrencher', 'Combo (trencher + plow)']],
            ['key' => 'backfill_blade', 'label' => 'Backfill blade', 'type' => 'yesno', 'options' => []]],
    ];
}

function field_templates(): array
{
    $j = json_decode(setting('field_templates', ''), true);
    return is_array($j) ? $j : field_templates_default();
}

function field_key(string $label): string
{
    $k = trim((string) preg_replace('/[^a-z0-9]+/', '_', mb_strtolower($label)), '_');
    return $k === 'undercarriage' ? 'undercarriage_pct' : ($k === 'tires' ? 'tires_pct' : mb_substr($k, 0, 40));
}

/** Template for a unit category (exact, else loose match e.g. "Mini Excavators" → Excavators). */
function field_template_for(string $category): array
{
    $t = field_templates();
    if (isset($t[$category])) { return [$category, $t[$category]]; }
    $c = mb_strtolower($category);
    foreach ($t as $k => $fields) { $kk = rtrim(mb_strtolower(explode(' ', $k)[0]), 's'); if ($kk !== '' && str_contains($c, $kk)) { return [$k, $fields]; } }
    return ['', []];
}

/** Stored type-field values (label => value) — public specs. */
function unit_type_fields(array $u): array
{
    $j = json_decode((string) ($u['type_fields'] ?? ''), true);
    return is_array($j) ? $j : [];
}

/** Values to show publicly (brochure / unit specs): template order, blanks skipped, built-in columns included. */
function type_field_specs(array $u): array
{
    [, $fields] = field_template_for((string) ($u['category'] ?? ''));
    $vals = unit_type_fields($u); $out = [];
    foreach ($fields as $f) {
        if (in_array($f['key'], ['undercarriage_pct', 'tires_pct'], true)) { $v = $u[$f['key']] ?? null; if ($v !== null && $v !== '') { $out[$f['label']] = (int) $v . '%'; } continue; }
        $v = trim((string) ($vals[$f['key']] ?? ''));
        if ($v !== '') { $out[$f['label']] = $v; }
    }
    return $out;
}

/** From POST tf[key] for the unit's current category → JSON (only that type's fields). */
function type_fields_from_post(string $category, array $post): ?string
{
    [, $fields] = field_template_for($category);
    $vals = [];
    foreach ($fields as $f) {
        if (in_array($f['key'], ['undercarriage_pct', 'tires_pct'], true)) { continue; }
        $v = clean_text((string) ($post[$f['key']] ?? ''), 120);
        if ($f['type'] === 'yesno' && !in_array($v, ['', 'Yes', 'No'], true)) { $v = ''; }
        if ($v !== '') { $vals[$f['key']] = $v; }
    }
    return $vals ? json_encode($vals, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
}

function promo_badge_html(array $u, string $cls = 'promo'): string
{
    if (empty($u['promo_enabled']) || trim((string) ($u['promo_text'] ?? '')) === '') { return ''; }
    [$bg, $fg] = PROMO_COLORS[$u['promo_color'] ?? 'yellow'] ?? PROMO_COLORS['yellow'];
    return '<span class="' . h($cls) . '" style="background:' . $bg . ';color:' . $fg . '">' . h(mb_substr((string) $u['promo_text'], 0, 24)) . '</span>';
}

// ---------- private notes (INTERNAL) ----------
function unit_notes(int $id): array
{
    return q('SELECT n.*, COALESCE(NULLIF(u.name, \'\'), u.email, \'\') who FROM unit_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.inventory_id = ? ORDER BY n.id DESC', [$id])->fetchAll();
}
function unit_note_add(int $id, int $userId, string $body): void
{
    $body = trim(clean_text($body, 5000));
    if ($body !== '') { q('INSERT INTO unit_notes (inventory_id, user_id, body) VALUES (?, ?, ?)', [$id, $userId, $body]); }
}

// ---------- Buyer Finder ----------
/** Leads looking for the same make/model first, then same type. Returns tiers => [[lead, score, reasons]]. */
function buyer_finder(array $u, int $limit = 300): array
{
    $tiers = ['model' => [], 'make' => [], 'type' => []];
    foreach (match_leads($u, $limit) as $m) {
        $r = $m['reasons'];
        $hasModel = in_array('Exact model', $r, true) || in_array('Model series', $r, true);
        $tier = $hasModel ? 'model' : (in_array('Make', $r, true) ? 'make' : (in_array('Type', $r, true) ? 'type' : null));
        if ($tier) { $tiers[$tier][] = $m; }
    }
    return $tiers;
}

// ---------- status actions ----------
/** List Now: publish Live immediately (buyer-safe check still applies). Returns error text or ''. */
function unit_list_now(int $id, int $userId, bool $ack = false): string
{
    $u = q_one('SELECT * FROM inventory WHERE id = ?', [$id]);
    if (!$u) { return 'Unit not found.'; }
    if ($u['status'] === 'Staged' && !$ack) { return 'This is a Staged (Sept 21) unit — tick “publish anyway” to list it.'; }
    if (($w = buyer_safe_warnings($u)) && !$ack) { return 'Buyer-safe check: ' . implode(' ', $w) . ' Fix it, or tick “publish anyway”.'; }
    if (!unit_is_verified($id)) { return 'Not verified yet. Only VERIFIED units can go Live: James verifies it first (Inventory Hub or the Verify button on the unit, Admin only).'; }
    unit_save(['status' => 'Live'], $id, $userId, true);
    if (is_file(__DIR__ . '/hunter_hook.php')) {
        require_once __DIR__ . '/hunter_hook.php';
        bam_hunter_on_unit_changed((int) $id);
    }
    return '';
}

/** Sold: record the sale (internal), set status Sold (badge on site), lead status, Sold automation drafts. Returns [drafts, error]. */
function unit_mark_sold(int $id, int $userId, float $price, ?int $leadId, string $note = ''): array
{
    $u = q_one('SELECT * FROM inventory WHERE id = ?', [$id]);
    if (!$u) { return [0, 'Unit not found.']; }
    if ($price <= 0) { return [0, 'Sold price is required.']; }
    $lead = $leadId ? q_one('SELECT * FROM leads WHERE id = ?', [$leadId]) : null;
    $buyer = $lead ? trim($lead['first_name'] . ' ' . $lead['last_name']) . ($lead['company'] ? ' (' . $lead['company'] . ')' : '') : '';
    q('INSERT INTO unit_sales (inventory_id, sold_price, buyer_lead_id, buyer_name, list_price, note, user_id) VALUES (?,?,?,?,?,?,?)',
        [$id, $price, $lead ? (int) $lead['id'] : null, mb_substr($buyer, 0, 160), $u['public_price'], mb_substr($note, 0, 500), $userId]);
    q('UPDATE inventory SET sold_price = ?, buyer_lead_id = ? WHERE id = ?', [$price, $lead ? (int) $lead['id'] : null, $id]);
    if ($lead) {
        q("UPDATE leads SET lead_status = 'Sold' WHERE id = ?", [(int) $lead['id']]);
        q("INSERT INTO unit_lead_matches (inventory_id, lead_id, score, reasons, status, followup, followup_at) VALUES (?, ?, 100, 'Buyer', 'Interested', 'sold', NOW())
           ON DUPLICATE KEY UPDATE status = 'Interested', followup = 'sold', followup_at = NOW()", [$id, (int) $lead['id']]);
    }
    $GLOBALS['bam_sold_buyer'] = $lead ? (int) $lead['id'] : 0;
    unit_save(['status' => 'Sold'], $id, $userId, true);   // hooks → Sold automation (drafts)
    unit_note_add($id, $userId, 'SOLD for ' . money($price) . ($buyer !== '' ? ' to ' . $buyer : '') . ($note !== '' ? ' — ' . $note : ''));
    return [(int) ($GLOBALS['bam_sold_drafts'] ?? 0), ''];
}

/** Sold automation: leads looking for the same model/type get a DRAFT “this one sold — similar units available”. */
function sold_followups(array $u): int
{
    if (!automation_on('unit_sold')) { return 0; }
    $min = automation_opt('unit_sold', 'auto_sold_min'); $max = automation_opt('unit_sold', 'auto_sold_max');
    $buyer = (int) ($GLOBALS['bam_sold_buyer'] ?? ($u['buyer_lead_id'] ?? 0));
    $n = 0;
    foreach (match_leads($u, 300) as $m) {
        if ($n >= $max || $m['score'] < $min || (int) $m['lead']['id'] === $buyer || trim((string) $m['lead']['email']) === '') { continue; }
        if (draft_email($u, $m['lead'], 'sold_similar')) { $n++; }
    }
    automation_log('unit_sold', $n, unit_title($u) . ': ' . $n . ' “sold — similar units” draft(s)');
    return $n;
}

/** Similar public units (same category, then same make) for the sold follow-up e-mail. */
function similar_units(array $u, int $n = 3): array
{
    $st = public_statuses(); $in = implode(',', array_fill(0, count($st), '?'));
    return q("SELECT " . PUBLIC_UNIT_COLUMNS . " FROM inventory WHERE status IN ($in) AND " . PUBLIC_VERIFIED_SQL . " AND status <> 'Sold' AND id <> ? AND (category = ? OR make = ?)
              ORDER BY (category = ?) DESC, (make = ?) DESC, updated_at DESC LIMIT " . (int) $n, [...$st, (int) $u['id'], (string) $u['category'], (string) $u['make'], (string) $u['category'], (string) $u['make']])->fetchAll();
}

/** Archive: PDF snapshot (brochure + internal details) → storage/archive/<id>/, then status Archived (off the site). */
function unit_archive(int $id, int $userId): array
{
    require_once __DIR__ . '/pdf.php';
    $u = q_one('SELECT * FROM inventory WHERE id = ?', [$id]);
    if (!$u) { return ['', 'Unit not found.']; }
    $name = 'archive_' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($u['stock_no'] ?: $id)) . '_' . date('Y-m-d_His') . '.pdf';
    $file = BAM_STORAGE . '/archive/' . $id . '/' . $name;
    $sales = q('SELECT * FROM unit_sales WHERE inventory_id = ? ORDER BY id', [$id])->fetchAll();
    $bytes = archive_pdf($u, unit_photos($id), unit_specs($u), unit_notes($id), $sales, $file);
    q('INSERT INTO unit_archives (inventory_id, filename, bytes, user_id) VALUES (?, ?, ?, ?)', [$id, $name, $bytes, $userId]);
    unit_save(['status' => 'Archived'], $id, $userId, true);
    q('UPDATE inventory SET archived_at = NOW() WHERE id = ?', [$id]);
    return [$name, ''];
}

// ---------- idle reminders (worker) ----------
function idle_reminders(): int
{
    if (!automation_on('idle_30')) { return 0; }
    $days = automation_opt('idle_30', 'auto_idle_days');
    $rows = q("SELECT i.id, i.stock_no, i.year, i.make, i.model, i.title FROM inventory i
               WHERE i.status = 'Live' AND i.updated_at < NOW() - INTERVAL ? DAY
                 AND NOT EXISTS (SELECT 1 FROM unit_events e WHERE e.inventory_id = i.id AND e.event IN ('info_request','quote_request','financing_request','shipping_request') AND e.created_at >= NOW() - INTERVAL ? DAY)
                 AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.inventory_id = i.id AND t.kind = 'idle' AND t.done_at IS NULL)
               LIMIT 500", [$days, $days])->fetchAll();
    foreach ($rows as $r) { q("INSERT INTO crm_tasks (kind, inventory_id, note) VALUES ('idle', ?, ?)", [(int) $r['id'], "No edits or inquiries for $days+ days — refresh photos/price, re-feature, or re-send to buyers."]); }
    return count($rows);
}

/** Website videos for a public unit page: YouTube/Vimeo embeds + public MP4 uploads (served by /video.php). */
function public_unit_videos(array $u): array
{
    $out = [];
    foreach (preg_split('/[\r\n]+/', (string) ($u['video_links_public'] ?? '')) ?: [] as $l) {
        $l = trim($l);
        if (preg_match('~(?:youtube\.com/(?:watch\?v=|shorts/|embed/)|youtu\.be/)([\w-]{6,20})~i', $l, $m)) { $out[] = ['type' => 'embed', 'src' => 'https://www.youtube-nocookie.com/embed/' . $m[1]]; }
        elseif (preg_match('~vimeo\.com/(?:video/)?(\d{5,12})~i', $l, $m)) { $out[] = ['type' => 'embed', 'src' => 'https://player.vimeo.com/video/' . $m[1]]; }
    }
    foreach (q("SELECT id, mime FROM inventory_files WHERE inventory_id = ? AND kind = 'video' AND is_public = 1 ORDER BY sort_order, id", [(int) $u['id']])->fetchAll() as $f) {
        $out[] = ['type' => 'mp4', 'src' => url('video.php?f=' . (int) $f['id'])];
    }
    return $out;
}
