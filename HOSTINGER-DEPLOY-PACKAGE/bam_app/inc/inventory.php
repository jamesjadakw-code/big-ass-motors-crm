<?php
/**
 * Inventory data access.
 *
 * BUYER-SAFE RULE: public pages must ONLY use public_units() / public_unit() below, which select
 * PUBLIC_UNIT_COLUMNS. Seller identity, seller/unit location, seller cost and source URL are never
 * selected for public output.
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }

const PUBLIC_UNIT_COLUMNS = 'id, stock_no, title, year, make, model, category, hours, serial_vin, unit_condition, '
    . 'public_price, status, featured, ai_specs, description, features, specifications_text, attachments, undercarriage_pct, tires_pct, '
    . 'slug, created_at, updated_at, sold_at, price_prev, price_reduced_at, live_at, show_price, promo_enabled, promo_text, promo_color, type_fields, video_links_public';

/** Internal-only fields — used by the buyer-safe linter and documentation. */
const INTERNAL_UNIT_FIELDS = ['seller_cost_ask', 'seller_name', 'seller_contact', 'seller_location',
    'unit_location_internal', 'source_url', 'internal_notes', 'seller_id', 'submitted_via', 'legacy_id',
    'engine_trans_notes', 'maintenance_notes', 'lien_title_status', 'availability_notes', 'inspection_contact',
    'video_urls', 'exclusive_agreement_at', 'exclusive_agreement_ver', 'exclusive_signed_name', 'description_original',
    'sold_price', 'buyer_lead_id', 'archived_at', 'sync_source_id', 'unit_zip', 'verified_at', 'verified_by'];

/** Every editable inventory column (admin side). */
const UNIT_EDIT_COLUMNS = ['stock_no', 'title', 'year', 'make', 'model', 'category', 'hours', 'serial_vin', 'unit_condition',
    'seller_cost_ask', 'public_price', 'price_override', 'seller_name', 'seller_contact', 'seller_location',
    'unit_location_internal', 'source_url', 'internal_notes', 'status', 'featured', 'ai_specs',
    'description', 'features', 'attachments', 'undercarriage_pct', 'tires_pct', 'engine_trans_notes',
    'maintenance_notes', 'lien_title_status', 'availability_notes', 'inspection_contact', 'video_urls',
    'seller_id', 'submitted_via', 'legacy_id', 'exclusive_agreement_at', 'exclusive_agreement_ver', 'exclusive_signed_name',
    'specifications_text', 'description_original', 'needs_original_photos', 'sync_source_id',
    'show_price', 'promo_enabled', 'promo_text', 'promo_color', 'type_fields', 'video_links_public', 'unit_zip'];

/**
 * Inventory Hub (update_hub): a unit can only be public (Live / Pending, and in buyer brochures) once James has VERIFIED it
 * (verified_at set, admin-only Verify). Every public query below adds this condition as a backstop.
 */
const PUBLIC_VERIFIED_SQL = 'verified_at IS NOT NULL';

/** update_hub schema present (inventory.verified_at)? */
function unit_verify_ready(): bool
{
    static $ok = null;
    if ($ok === null) { try { q('SELECT verified_at, unit_zip FROM inventory LIMIT 1'); $ok = true; } catch (Throwable) { $ok = false; } }
    return $ok;
}

function unit_is_verified(int $id): bool
{
    return $id > 0 && unit_verify_ready() && (bool) q_val('SELECT verified_at IS NOT NULL FROM inventory WHERE id = ?', [$id]);
}

function public_statuses(): array
{
    return setting('show_pending_public', '1') === '1' ? ['Live', 'Pending'] : ['Live'];
}

function unit_title(array $u): string
{
    if (trim((string) ($u['title'] ?? '')) !== '') { return trim((string) $u['title']); }
    return trim(implode(' ', array_filter([(string) ($u['year'] ?? ''), (string) ($u['make'] ?? ''), (string) ($u['model'] ?? '')])));
}

/** SEO URL: /2015-caterpillar-301-7d-excavator (falls back to unit.php?id= when a unit has no slug yet). */
function unit_url(array $u, string $src = ''): string
{
    $q = $src !== '' ? '?src=' . rawurlencode($src) : '';
    if (!empty($u['slug'])) { return public_link(rawurlencode((string) $u['slug']) . $q); }
    return public_link('unit.php?id=' . (int) $u['id'] . ($src !== '' ? '&src=' . rawurlencode($src) : ''));
}

/** Singular type word for slugs/titles: "Trenchers & Rock Saws" -> "trencher", "Excavators" -> "excavator". */
function category_noun(string $cat): string
{
    $c = mb_strtolower(trim(explode('&', category_label($cat))[0] ?? ''));
    $c = preg_replace('/\s+/', ' ', trim($c)) ?? '';
    return preg_replace('/(ies)$/', 'y', preg_replace('/(?<=[a-z])s$/', '', $c) ?? $c) ?? $c;
}

/** Unique slug: year-make-model-type (e.g. 2015-caterpillar-301-7d-excavator); "-stock" suffix on collision. */
function unit_slug(array $u, int $id): string
{
    $model = preg_replace('/(\d)\.(\d)/', '$1-$2', (string) ($u['model'] ?? '')) ?? '';
    $core = slugify(trim(($u['year'] ?? '') . ' ' . ($u['make'] ?? '') . ' ' . $model));
    $noun = slugify(category_noun((string) ($u['category'] ?? '')));
    $base = ($noun !== '' && !str_contains('-' . $core . '-', '-' . $noun . '-')) ? trim($core . '-' . $noun, '-') : $core;
    if ($base === '' || !preg_match('/[a-z]/', $base)) { $base = slugify(unit_title($u)) ?: 'unit'; }
    if (preg_match('/^(unit|inventory|seller|contact|about|brochure|sitemap|index|uploads|assets)$/', $base)) { $base .= '-' . $id; }
    $slug = mb_substr($base, 0, 150);
    if (q_val('SELECT id FROM inventory WHERE slug = ? AND id <> ? LIMIT 1', [$slug, $id])) {
        $slug = mb_substr($base, 0, 130) . '-' . slugify((string) ($u['stock_no'] ?? '') ?: (string) $id);
        if (q_val('SELECT id FROM inventory WHERE slug = ? AND id <> ? LIMIT 1', [$slug, $id])) { $slug .= '-' . $id; }
    }
    return $slug;
}

/** Recently sold units stay visible (SOLD marker) for social proof; setting show_sold_public / sold_public_days. */
function public_where(): array
{
    $st = public_statuses();
    $w = 'status IN (' . implode(',', array_fill(0, count($st), '?')) . ')';
    $p = $st;
    $w = "($w AND " . PUBLIC_VERIFIED_SQL . ')';
    if (setting('show_sold_public', '1') === '1') {
        $w = "($w OR (status = 'Sold' AND " . PUBLIC_VERIFIED_SQL . " AND sold_at > NOW() - INTERVAL ? DAY))";
        $p[] = max(1, (int) setting('sold_public_days', '60'));
    }
    return [$w, $p];
}

function unit_is_reduced(array $u): bool
{
    if (!unit_price_shown($u) || setting('auto_price_drop', '1') !== '1') { return false; }
    return !empty($u['price_reduced_at']) && !empty($u['price_prev']) && (float) $u['public_price'] > 0 && (float) $u['public_price'] < (float) $u['price_prev']
        && strtotime((string) $u['price_reduced_at']) > time() - 86400 * max(1, (int) setting('reduced_days', '30'));
}

/** Price visibility: every NEW unit defaults to hidden (Call for Price) until "Show price" is switched on. */
function unit_price_shown(array $u): bool
{
    return !array_key_exists('show_price', $u) || (int) $u['show_price'] === 1;
}

function unit_price_label(array $u): string
{
    if (!unit_price_shown($u)) { return 'Call for Price'; }
    $p = (float) ($u['public_price'] ?? 0);
    return $p > 0 ? money($p) : 'Call for Price';
}

/** Strip anything internal from a unit row (defence in depth). */
function unit_public_view(array $u): array
{
    foreach (INTERNAL_UNIT_FIELDS as $f) { unset($u[$f]); }
    unset($u['price_override'], $u['created_by'], $u['serial_norm']);
    if (!unit_price_shown($u)) { $u['public_price'] = null; $u['price_prev'] = null; }
    if (setting('show_serial_public', '0') !== '1') { $u['serial_vin'] = ''; }
    return $u;
}

/** Public list with filters: q, category, make, year_min, year_max, price_max, sort, featured. */
function public_units(array $f = [], int $limit = 24, int $offset = 0, ?int &$total = null): array
{
    $where = [];
    $p = [];
    [$pw, $pp] = public_where();
    $where[] = $pw;
    array_push($p, ...$pp);
    if (!empty($f['category'])) { $where[] = 'category = ?'; $p[] = $f['category']; }
    if (!empty($f['make']))     { $where[] = 'make = ?';     $p[] = $f['make']; }
    if (!empty($f['year_min'])) { $where[] = 'year >= ?';    $p[] = (int) $f['year_min']; }
    if (!empty($f['year_max'])) { $where[] = 'year <= ?';    $p[] = (int) $f['year_max']; }
    if (!empty($f['price_max'])){ $where[] = '(show_price = 1 AND public_price IS NOT NULL AND public_price <= ?)'; $p[] = (float) $f['price_max']; }
    if (!empty($f['featured'])) { $where[] = 'featured = 1'; }
    if (!empty($f['q'])) {
        foreach (preg_split('/\s+/', trim((string) $f['q'])) ?: [] as $term) {
            if ($term === '') { continue; }
            $where[] = "CONCAT_WS(' ', stock_no, year, make, model, category) LIKE ?";
            $p[] = '%' . $term . '%';
        }
    }
    $order = match ($f['sort'] ?? '') {
        'price_asc'  => 'IF(show_price = 1, public_price, NULL) IS NULL, IF(show_price = 1, public_price, NULL) ASC',
        'price_desc' => 'IF(show_price = 1, public_price, NULL) DESC',
        'year_desc'  => 'year DESC',
        'hours_asc'  => 'hours IS NULL, hours ASC',
        default      => "FIELD(status,'Live','Pending','Sold'), featured DESC, updated_at DESC",
    };
    $sqlWhere = implode(' AND ', $where);
    $total = (int) q_val("SELECT COUNT(*) FROM inventory WHERE $sqlWhere", $p);
    $rows = q('SELECT ' . PUBLIC_UNIT_COLUMNS . " FROM inventory WHERE $sqlWhere ORDER BY $order LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset, $p)->fetchAll();
    return array_map('unit_public_view', attach_primary_photos($rows));
}

function public_unit(int $id, bool $allowAnyStatus = false): ?array
{
    $u = q_one('SELECT ' . PUBLIC_UNIT_COLUMNS . ', (' . PUBLIC_VERIFIED_SQL . ') AS _verified FROM inventory WHERE id = ?', [$id]);
    if (!$u) { return null; }
    $verified = (int) $u['_verified'] === 1; unset($u['_verified']);
    if (!$allowAnyStatus && !$verified) { return null; }   // update_hub: never public before Verify
    $soldOk = $u['status'] === 'Sold' && setting('show_sold_public', '1') === '1' && !empty($u['sold_at'])
        && strtotime((string) $u['sold_at']) > time() - 86400 * max(1, (int) setting('sold_public_days', '60'));
    if (!$allowAnyStatus && !$soldOk && !in_array($u['status'], public_statuses(), true)) { return null; }
    return unit_public_view($u);
}

function public_facets(): array
{
    $st = public_statuses();
    $in = implode(',', array_fill(0, count($st), '?'));
    return [
        'categories' => q("SELECT category, COUNT(*) n FROM inventory WHERE status IN ($in) AND " . PUBLIC_VERIFIED_SQL . " AND category <> '' GROUP BY category ORDER BY category", $st)->fetchAll(),
        'makes'      => q("SELECT make, COUNT(*) n FROM inventory WHERE status IN ($in) AND " . PUBLIC_VERIFIED_SQL . " AND make <> '' GROUP BY make ORDER BY make", $st)->fetchAll(),
        'years'      => q("SELECT MIN(year) lo, MAX(year) hi FROM inventory WHERE status IN ($in) AND " . PUBLIC_VERIFIED_SQL, $st)->fetch() ?: ['lo' => null, 'hi' => null],
    ];
}

// ---------------------------------------------------------------- photos
function unit_photos(int $id): array
{
    return q('SELECT * FROM inventory_photos WHERE inventory_id = ? ORDER BY is_primary DESC, sort_order, id', [$id])->fetchAll();
}

/**
 * $thumb: false = full size, true = card/gallery thumb (~700px), 'small' = tiny list thumb (~100px).
 * Hot-linked i.machineryhost.com photos (old-site import) have size variants: original- (960px), medium- (700px), small- (100px).
 */
function photo_url(array $photo, bool|string $thumb = false): string
{
    if (($photo['filename'] ?? '') === '') {
        $u = (string) ($photo['external_url'] ?? '');
        if ($thumb && str_contains($u, '//i.machineryhost.com/')) {
            $u = preg_replace('~/(original|large)-~', $thumb === 'small' ? '/small-' : '/medium-', $u, 1) ?? $u;
        }
        return $u;
    }
    $file = $thumb && $photo['thumb'] !== '' ? $photo['thumb'] : $photo['filename'];
    return public_link('uploads/inventory/' . (int) $photo['inventory_id'] . '/' . rawurlencode($file));
}

function attach_primary_photos(array $rows): array
{
    if (!$rows) { return $rows; }
    $ids = array_map(fn($r) => (int) $r['id'], $rows);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $photos = [];
    $counts = [];
    foreach (q("SELECT * FROM inventory_photos WHERE inventory_id IN ($in) ORDER BY is_primary DESC, sort_order, id", $ids)->fetchAll() as $ph) {
        $iid = (int) $ph['inventory_id'];
        $counts[$iid] = ($counts[$iid] ?? 0) + 1;
        if (!isset($photos[$iid])) { $photos[$iid] = $ph; }
    }
    foreach ($rows as &$r) {
        $r['_photo'] = $photos[(int) $r['id']] ?? null;
        $r['_photo_count'] = $counts[(int) $r['id']] ?? 0;
    }
    return $rows;
}

// ---------------------------------------------------------------- AI specs JSON
function unit_specs(array $u): array
{
    $tf = function_exists('type_field_specs') ? type_field_specs($u) : [];
    return $tf ? array_merge(unit_specs_ai($u), $tf) : unit_specs_ai($u);
}

function unit_specs_ai(array $u): array
{
    $j = json_decode((string) ($u['ai_specs'] ?? ''), true);
    if (!is_array($j)) { return []; }
    $specs = $j['specs'] ?? $j;
    $out = [];
    if (is_array($specs)) {
        foreach ($specs as $k => $v) {
            if (is_array($v)) {   // [{"label":..,"value":..}] form
                $k = (string) ($v['label'] ?? $v['name'] ?? $k);
                $v = (string) ($v['value'] ?? '');
            }
            if (is_string($k) && trim($k) !== '' && trim((string) $v) !== '' && !in_array($k, ['highlights', 'description'], true)) {
                $out[trim($k)] = trim((string) $v);
            }
        }
    }
    return $out;
}

// ---------------------------------------------------------------- pricing + saving
/**
 * update_hub: there is NO automatic price any more (no default markup). James sets the public price per machine; blank = Call for Price.
 * The seller ask (seller_cost_ask) is internal only and never becomes the public price. Kept for old callers: always null.
 */
function auto_public_price(?float $sellerAsk): ?float
{
    return null;
}

/** Normalise + save a unit (admin). $d keys = inventory columns. Returns id. */
function unit_save(array $d, ?int $id = null, ?int $userId = null, bool $hooks = true): int
{
    $row = [];
    foreach (UNIT_EDIT_COLUMNS as $c) {
        if (array_key_exists($c, $d)) { $row[$c] = $d[$c]; }
    }
    if (array_key_exists('stock_no', $row)) {
        $row['stock_no'] = trim((string) $row['stock_no']) === '' ? null : mb_substr(trim((string) $row['stock_no']), 0, 40);
    }
    if (array_key_exists('serial_vin', $row)) { $row['serial_norm'] = norm_serial((string) $row['serial_vin']); }
    if (isset($row['status']) && !in_array($row['status'], UNIT_STATUSES, true)) { $row['status'] = 'Draft'; }

    // Price rule (update_hub): the public price is ONLY what was typed. No markup, never copied from the seller ask, never recalculated.
    // Not given → the stored price stays exactly as it is. Given blank → Call for Price. New units: blank + show_price off.
    $existing = $id ? q_one('SELECT seller_cost_ask, public_price, price_override, status, year, make, model, category, stock_no, live_at FROM inventory WHERE id = ?', [$id]) : null;
    unset($row['price_override']);
    if (array_key_exists('public_price', $row)) {
        $row['public_price'] = $row['public_price'] === null || $row['public_price'] === '' || (float) $row['public_price'] <= 0 ? null : round((float) $row['public_price'], 2);
        $row['price_override'] = 1;   // a hand-set price (legacy flag, nothing recalculates prices any more)
    }
    if (!$id) {
        if (!array_key_exists('public_price', $row)) { $row['public_price'] = null; }
        if (!array_key_exists('show_price', $row)) { $row['show_price'] = 0; }
    }
    // Draft / Verified gate (update_hub): Live / Pending only for a VERIFIED unit — otherwise the status is held back.
    if (isset($row['status']) && in_array($row['status'], ['Live', 'Pending'], true) && !unit_is_verified((int) $id)) {
        $held = $existing && !in_array($existing['status'], ['Live', 'Pending'], true) ? $existing['status'] : 'Draft';
        $GLOBALS['bam_verify_blocked'][] = ['id' => (int) $id, 'wanted' => $row['status'], 'kept' => $held];
        $row['status'] = $held;
    }

    $merged = array_merge($existing ?? [], $row);
    // price-drop marker
    $oldPrice = $existing ? (float) ($existing['public_price'] ?? 0) : 0.0;
    $newPrice = (float) ($row['public_price'] ?? ($existing['public_price'] ?? 0));
    if ($existing && $oldPrice > 0 && $newPrice > 0 && $newPrice < $oldPrice) { $row['price_prev'] = $oldPrice; $row['price_reduced_at'] = date('Y-m-d H:i:s'); }
    elseif ($existing && $newPrice > $oldPrice && $oldPrice > 0) { $row['price_prev'] = null; $row['price_reduced_at'] = null; }
    if (($row['status'] ?? '') === 'Live' && empty($existing['live_at'])) { $row['live_at'] = date('Y-m-d H:i:s'); }
    if (isset($row['status'])) {
        if ($row['status'] === 'Sold' && ($existing['status'] ?? '') !== 'Sold') { $row['sold_at'] = date('Y-m-d H:i:s'); }
        if ($row['status'] !== 'Sold') { $row['sold_at'] = null; }
    }

    if (array_key_exists('unit_zip', $row)) { $row['unit_zip'] = preg_match('/^\s*(\d{5})(?:-\d{4})?\s*$/', (string) $row['unit_zip'], $zm) ? $zm[1] : ''; }
    if ($id && array_key_exists('stock_no', $row) && $row['stock_no'] === null) { unset($row['stock_no']); }   // blank = keep existing
    if ($id) {
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($row)));
        q("UPDATE inventory SET $set WHERE id = ?", [...array_values($row), $id]);
    } else {
        $row['created_by'] = $userId;
        $names = implode(', ', array_map(fn($c) => "`$c`", array_keys($row)));
        $ph = implode(', ', array_fill(0, count($row), '?'));
        q("INSERT INTO inventory ($names) VALUES ($ph)", array_values($row));
        $id = (int) db()->lastInsertId();
    }
    q('UPDATE inventory SET stock_no = ? WHERE id = ? AND stock_no IS NULL', [setting('stock_prefix', 'BAM-') . (10000 + $id), $id]);
    $saved = q_one('SELECT year, make, model, category, stock_no, title FROM inventory WHERE id = ?', [$id]);
    q('UPDATE inventory SET slug = ? WHERE id = ?', [unit_slug($saved, $id), $id]);
    if ($hooks) {
        require_once __DIR__ . '/automation.php';
        automation_after_save($id, $existing['status'] ?? '', $oldPrice);
        if (is_file(__DIR__ . '/hunter_hook.php')) {
            require_once __DIR__ . '/hunter_hook.php';
            bam_hunter_on_unit_changed((int) $id);
        }
    }
    return $id;
}

/** update_hub: automatic prices are gone — nothing is ever recalculated (existing prices stay exactly as they are). */
function recalc_auto_prices(): int
{
    return 0;
}

/**
 * Buyer-safe linter: flags public text (description/features/specs/model) that leaks seller name,
 * locations, cost or URLs. Returns list of human-readable warnings.
 */
function buyer_safe_warnings(array $u): array
{
    $public = mb_strtolower(implode("\n", [
        (string) ($u['description'] ?? ''), (string) ($u['features'] ?? ''), (string) ($u['ai_specs'] ?? ''),
        (string) ($u['attachments'] ?? ''), (string) ($u['specifications_text'] ?? ''),
        (string) ($u['model'] ?? ''), (string) ($u['unit_condition'] ?? ''),
    ]));
    if (trim($public) === '') { return []; }
    $w = [];
    if (preg_match('~https?://|www\.(?!bigassmotors)~i', $public)) { $w[] = 'Public text contains a web link.'; }
    if (preg_match('/big\s*motor\s*traders|bigmotortraders|machinio/i', $public)) { $w[] = 'Public text mentions Big Motor Traders / Machinio.'; }
    if (preg_match('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i', str_replace(BAM_EMAIL, '', $public))) { $w[] = 'Public text contains an e-mail address.'; }
    $phones = preg_replace('/904[.\-\s]?767[.\-\s]?5232|904[.\-\s]?729[.\-\s]?1051/', '', $public) ?? '';
    if (preg_match('/\(?\b\d{3}\)?[.\-\s]\d{3}[.\-\s]\d{4}\b/', $phones)) { $w[] = 'Public text contains a non-BAM phone number.'; }
    if (preg_match('/ritchie|richie bros|ironplanet|machinery ?trader|equipment ?trader|facebook marketplace|craigslist|govdeals|purple wave|proxibid|auction/i', $public)) { $w[] = 'Public text names a source marketplace / auction (possible seller identity).'; }
    if (preg_match('/\b(james|adrienne|fernanda|matt)\b/i', $public)) { $w[] = 'Public text contains a personal name (James/Adrienne/...).'; }
    $checks = [
        'seller name'     => (string) ($u['seller_name'] ?? ''),
        'seller contact'  => (string) ($u['seller_contact'] ?? ''),
        'seller location' => (string) ($u['seller_location'] ?? ''),
        'unit location'   => (string) ($u['unit_location_internal'] ?? ''),
    ];
    if (preg_match('/^\d{5}$/', (string) ($u['unit_zip'] ?? '')) && preg_match('/\b' . $u['unit_zip'] . '\b/', $public)) { $w[] = 'Public text contains the unit ZIP code (' . h((string) $u['unit_zip']) . ').'; }
    foreach ($checks as $label => $val) {
        foreach (preg_split('/[,;\/|()]+/', mb_strtolower($val)) ?: [] as $tok) {
            $tok = trim($tok);
            if (mb_strlen($tok) >= 4 && !in_array($tok, ['usa', 'united states', 'none', 'unknown', 'n/a'], true) && str_contains($public, $tok)) {
                $w[] = 'Public text mentions the ' . $label . ' ("' . h($tok) . '").';
            }
        }
        if (in_array($label, ['seller location', 'unit location'], true)
            && preg_match('/,\s*([a-z]{2})\b/', mb_strtolower($val), $m)
            && preg_match('/,\s*' . preg_quote($m[1], '/') . '\b/', $public)) {
            $w[] = 'Public text may contain the ' . $label . ' state ("' . h(strtoupper($m[1])) . '").';
        }
    }
    $ask = (float) ($u['seller_cost_ask'] ?? 0);
    if ($ask > 0) {
        $n = number_format($ask);
        if (str_contains($public, $n) || preg_match('/\b' . (int) $ask . '\b/', $public)) {
            $w[] = 'Public text contains the seller cost (' . h(money($ask)) . ').';
        }
    }
    return array_values(array_unique($w));
}

require_once __DIR__ . '/listing.php';   // type-field specs, promo banners, notes, Sold/Archive helpers
