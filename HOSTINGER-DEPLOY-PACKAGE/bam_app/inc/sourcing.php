<?php
/**
 * Wanted / Sourcing: buyers' wanted requests + a Sourcing Results inbox fed by external sweeps
 * (pushed from James's box to crm .../inventory/api/sourcing_import.php with the API token).
 * Every result is matched to open wanted requests and to leads; one click turns it into a Draft unit.
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }
require_once __DIR__ . '/matching.php';

/** Column aliases accepted by the import (JSON keys or CSV headers, case/space-insensitive). */
const SOURCING_ALIASES = [
    'url' => ['url', 'link', 'listing_url', 'listing url', 'source_url', 'source url', 'item_url'],
    'source_site' => ['source_site', 'source site', 'site', 'source', 'website'],
    'listing_id' => ['listing_id', 'listing id', 'id', 'source_id', 'source id'],
    'title' => ['title', 'name', 'equipment_name'],
    'year' => ['year'],
    'make' => ['make', 'brand', 'manufacturer'],
    'model' => ['model'],
    'category' => ['category', 'type', 'machine_class', 'machine class', 'class'],
    'hours' => ['hours', 'meter', 'hours_meter'],
    'price' => ['price', 'price_usd', 'price usd', 'asking_price', 'ask', 'cost'],
    'location' => ['location', 'location_city_state', 'location city/state', 'city_state'],
    'city' => ['city', 'location city'],
    'state' => ['state', 'location state'],
    'seller_name' => ['seller_name', 'seller name', 'seller', 'dealer'],
    'seller_contact' => ['seller_contact', 'seller contact', 'seller_phone', 'seller phone', 'phone', 'contact', 'seller_info'],
    'photos' => ['photos', 'photo_urls', 'images', 'image_urls', 'photo', 'image', 'gallery'],
    'description' => ['description', 'desc', 'notes'],
    'found_at' => ['found_at', 'found at', 'date', 'scraped_at', 'date found', 'date_posted'],
    'is_third_party' => ['is_third_party', 'is third party', 'third_party', 'third party', 'is_thirdparty'],
];

function sourcing_norm_row(array $raw): array
{
    $low = [];
    foreach ($raw as $k => $v) { $low[mb_strtolower(trim(str_replace(['_', '-'], ' ', (string) $k)))] = $v; }
    $get = function (string $f) use ($low) {
        foreach (SOURCING_ALIASES[$f] as $a) { $a = str_replace('_', ' ', $a); if (isset($low[$a]) && $low[$a] !== '' && $low[$a] !== null) { return $low[$a]; } }
        return null;
    };
    $photos = $get('photos');
    if (is_string($photos)) { $photos = preg_split('/[\s,;|]+/', $photos) ?: []; }
    $photos = array_values(array_filter(array_map('trim', (array) $photos), fn($u) => preg_match('~^https?://~i', $u)));
    $num = fn($v) => ($v === null || ($s = preg_replace('/[^\d.]/', '', (string) $v)) === '' || $s === '.') ? null : (float) $s;
    // PRICE: taken exactly as listed. Only plain numbers ("46000", "46,000", "$46,000.00") are accepted; anything else
    // ("46k", "Call") is kept as text in price_raw and the price stays empty (= "Call for Price"). No markup, no rule.
    $priceRaw = trim((string) $get('price'));
    $price = preg_match('/^\$?\s*\d{1,3}(,\d{3})*(\.\d+)?$|^\$?\s*\d+(\.\d+)?$/', $priceRaw) ? (float) str_replace([',', '$', ' '], '', $priceRaw) : null;
    $loc = trim((string) ($get('location') ?? trim(($get('city') ?? '') . ', ' . ($get('state') ?? ''), ', ')));
    $year = (int) $num($get('year'));
    $r = [
        'url' => mb_substr(trim((string) $get('url')), 0, 700), 'source_site' => mb_substr(trim((string) $get('source_site')), 0, 80),
        'listing_id' => mb_substr(trim((string) $get('listing_id')), 0, 80), 'year' => $year >= 1950 && $year <= (int) date('Y') + 1 ? $year : null,
        'make' => mb_substr(trim((string) $get('make')), 0, 80), 'model' => mb_substr(trim((string) $get('model')), 0, 120),
        'category' => '', 'hours' => $num($get('hours')), 'price' => $price, 'price_raw' => $priceRaw,
        'location' => mb_substr($loc, 0, 160), 'seller_name' => mb_substr(trim((string) $get('seller_name')), 0, 190),
        'seller_contact' => mb_substr(trim((string) $get('seller_contact')), 0, 255), 'photo_urls' => implode("\n", array_slice($photos, 0, 40)),
        'description' => mb_substr(trim((string) $get('description')), 0, 20000), 'found_at' => ($t = strtotime((string) $get('found_at'))) ? date('Y-m-d H:i:s', $t) : date('Y-m-d H:i:s'),
        'is_third_party' => ($itp = $get('is_third_party')) !== null ? ((int)$itp ? 1 : 0) : 1,
    ];
    $r['title'] = mb_substr(trim((string) ($get('title') ?? '')) ?: trim(($r['year'] ?? '') . ' ' . $r['make'] . ' ' . $r['model']), 0, 255);
    if ($r['source_site'] === '' && $r['url'] !== '') { $r['source_site'] = preg_replace('/^www\./', '', (string) parse_url($r['url'], PHP_URL_HOST)); }
    $cls = trim((string) $get('category'));
    $tk = type_key($cls) ?: type_key($r['model'] . ' ' . $r['title']);
    $r['category'] = mb_substr($tk !== '' ? (CATEGORY_LABELS[$tk] ?? category_label($cls)) : category_label($cls), 0, 80);
    return $r;
}

/** Insert/update rows; returns ['inserted','updated','skipped','matched','draft_ids'=>[],'errors'=>[]]. */
function sourcing_ingest(array $rows, bool $createDrafts = false, int $userId = 1): array
{
    $res = ['inserted' => 0, 'updated' => 0, 'skipped' => 0, 'matched' => 0, 'draft_ids' => [], 'errors' => []];
    foreach (array_slice($rows, 0, 5000) as $i => $raw) {
        if (!is_array($raw)) { $res['skipped']++; continue; }
        $r = sourcing_norm_row($raw);
        if (!preg_match('~^https?://~i', (string) $r['url']) && ($r['make'] === '' && $r['title'] === '')) {
            $res['skipped']++;
            if (count($res['errors']) < 20) { $res['errors'][] = 'row ' . ($i + 1) . ': needs url or make/title'; }
            continue;
        }
        $hash = sha1(strtolower(preg_replace('~[#?].*$~', '', (string) $r['url']) . '|' . (string) $r['listing_id']));
        $ex = q_one('SELECT id, status, inventory_id FROM sourcing_results WHERE url_hash = ?', [$hash]);
        $cols = ['source_site', 'listing_id', 'url', 'title', 'year', 'make', 'model', 'category', 'hours', 'price', 'price_raw', 'location', 'seller_name', 'seller_contact', 'photo_urls', 'description', 'found_at'];
        $vals = array_map(fn($c) => $r[$c], $cols);
        $raw_json = json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        if ($ex) {
            q('UPDATE sourcing_results SET ' . implode(', ', array_map(fn($c) => "$c = ?", $cols)) . ', raw_json = ? WHERE id = ?', [...$vals, $raw_json, $ex['id']]);
            $id = (int) $ex['id']; $res['updated']++;
        } else {
            q('INSERT INTO sourcing_results (url_hash, ' . implode(', ', $cols) . ', raw_json) VALUES (?' . str_repeat(', ?', count($cols)) . ', ?)', [$hash, ...$vals, $raw_json]);
            $id = (int) db()->lastInsertId(); $res['inserted']++;
        }
        if (sourcing_match_result($id) > 0) { $res['matched']++; }

        if ($createDrafts) {
            try {
                $uid = sourcing_row_to_pregrabbed_draft($r, $userId, $id);
                if ($uid > 0 && !in_array($uid, $res['draft_ids'], true)) {
                    $res['draft_ids'][] = $uid;
                }
            } catch (Throwable $de) {
                if (count($res['errors']) < 20) { $res['errors'][] = 'Draft creation for row ' . ($i + 1) . ': ' . $de->getMessage(); }
            }
        }
    }
    return $res;
}

/**
 * Fully pre-grab and store a listing row directly into Inventory as a Draft:
 * 1. Queries authoritative OEM specs (via oem_specs_for_unit) & merges with parsed specs
 * 2. Generates canonical single-paragraph AI description (via generate_ai_single_paragraph)
 * 3. Preserves original raw text in description_original
 * 4. Downloads up to 10 photos into uploads/inventory/<id>/ (with external hotlink fallback)
 * 5. Pre-generates and attaches the official 2-page equipment brochure (brochure_attach_to_unit)
 * 6. Sets status = 'Draft', public price blank, show_price off (Call for Price)
 */
function sourcing_row_to_pregrabbed_draft(array $r, int $userId = 1, ?int $sourcingId = null): int
{
    require_once BAM_ROOT . '/inc/inventory.php';
    require_once BAM_ROOT . '/inc/oem_specs.php';
    require_once BAM_ROOT . '/inc/url_import.php';
    require_once BAM_ROOT . '/inc/images.php';
    require_once BAM_ROOT . '/inc/fetch.php';
    require_once BAM_ROOT . '/inc/brochure.php';

    // If already converted, return existing unit id
    if ($sourcingId) {
        $exInv = q_val('SELECT inventory_id FROM sourcing_results WHERE id = ?', [$sourcingId]);
        if ($exInv && q_val('SELECT id FROM inventory WHERE id = ?', [$exInv])) {
            return (int) $exInv;
        }
    }
    if (!empty($r['url'])) {
        $norm = strtolower(rtrim(preg_replace('~^https?://(www\.)?|[#?].*$~i', '', (string)$r['url']) ?? '', '/'));
        if ($norm !== '') {
            $exUnit = q_val("SELECT id FROM inventory WHERE LOWER(TRIM(TRAILING '/' FROM REGEXP_REPLACE(REGEXP_REPLACE(source_url, '[#?].*$', ''), '^https?://(www\\.)?', ''))) = ? LIMIT 1", [$norm]);
            if ($exUnit) {
                if ($sourcingId) { q("UPDATE sourcing_results SET status = 'Added', inventory_id = ? WHERE id = ?", [$exUnit, $sourcingId]); q("UPDATE inventory SET url_listing = 1 WHERE id = ?", [$exUnit]); }
                return (int) $exUnit;
            }
        }
    }

    $rawDesc = (string) ($r['description'] ?? '');
    $aiDesc = generate_ai_single_paragraph($r, $rawDesc);
    $parsedSpecs = function_exists('spec_rows_from_text') ? spec_rows_from_text(['description' => $rawDesc, 'specifications_text' => '']) : ['specs' => []];
    $oemSpecs = oem_specs_for_unit($r);
    $allSpecs = array_merge($oemSpecs, $parsedSpecs['specs'] ?? []);

    $specText = '';
    foreach ($allSpecs as $k => $v) {
        $specText .= "$k: $v\n";
    }

    $year = !empty($r['year']) ? (int) $r['year'] : null;
    $make = clean_text((string)($r['make'] ?? ''), 80);
    $model = clean_text((string)($r['model'] ?? ''), 120);
    $title = clean_text((string)($r['title'] ?? ''), 255);
    if ($make === '' && $model === '') {
        if ($title !== '') {
            $make = 'Listing';
            $model = mb_substr($title, 0, 120);
        } else {
            $make = 'Equipment';
            $model = 'Imported Draft';
        }
    }

    $price = null;
    if (isset($r['price']) && is_numeric($r['price']) && (float)$r['price'] > 0) {
        $price = (float) $r['price'];
    } elseif (!empty($r['price_raw'])) {
        $cleanP = preg_replace('/[^\d.]/', '', (string)$r['price_raw']);
        if ($cleanP !== '' && is_numeric($cleanP)) {
            $price = (float) $cleanP;
        }
    }

    $d = [
        'year' => $year,
        'make' => $make,
        'model' => $model,
        'category' => clean_text((string)($r['category'] ?? ''), 80),
        'hours' => isset($r['hours']) && is_numeric($r['hours']) ? (float)$r['hours'] : null,
        'serial_vin' => clean_text((string)($r['serial'] ?? $r['listing_id'] ?? ''), 80),
        'seller_cost_ask' => $price,
        'public_price' => null,
        'price_override' => 0,
        'show_price' => 0,
        'status' => 'Draft',
        'submitted_via' => 'import',
        'title' => $title,
        'seller_name' => clean_text((string)($r['seller_name'] ?? ''), 160),
        'seller_contact' => clean_text((string)($r['seller_contact'] ?? ''), 255),
        'seller_location' => clean_text((string)($r['location'] ?? ''), 160),
        'unit_location_internal' => clean_text((string)($r['location'] ?? ''), 160),
        'source_url' => !empty($r['url']) && preg_match('~^https?://~i', (string)$r['url']) ? mb_substr((string)$r['url'], 0, 700) : '',
        'needs_original_photos' => 1,
        'description' => $aiDesc,
        'description_original' => mb_substr(trim($rawDesc), 0, 20000),
        'ai_specs' => json_encode($allSpecs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'specifications_text' => trim($specText),
        'internal_notes' => 'Imported Draft ' . date('Y-m-d H:i') . ' from ' . (!empty($r['source_site']) ? $r['source_site'] : 'Daily Sweep')
            . (!empty($r['url']) ? "\nURL: " . $r['url'] : '')
            . "\nSource listed ask: " . (!empty($r['price_raw']) ? $r['price_raw'] : ($price ? '$' . number_format($price) : '(none)'))
            . "\n\nOriginal listing text:\n" . mb_substr(trim($rawDesc), 0, 4000),
    ];

    $unitId = unit_save($d, null, $userId, false);
    q('UPDATE inventory SET url_listing = 1, public_price = NULL, show_price = 0, price_override = 0, submitted_via = "scraper" WHERE id = ?', [$unitId]);

    // Crawl & download up to 10 photos
    $rawPhotos = [];
    if (!empty($r['photo_urls'])) {
        $rawPhotos = is_array($r['photo_urls']) ? $r['photo_urls'] : explode("\n", (string)$r['photo_urls']);
    } elseif (!empty($r['photos'])) {
        $rawPhotos = is_array($r['photos']) ? $r['photos'] : explode("\n", (string)$r['photos']);
    }
    $photoUrls = array_values(array_unique(array_filter(array_map('trim', (array)$rawPhotos), fn($u) => preg_match('~^https?://~i', (string)$u))));

    // If no photos passed and URL is fetchable (e.g. Machinery Trader), try safe fetch to get photos
    if (empty($photoUrls) && !empty($r['url']) && preg_match('~^https?://~i', (string)$r['url']) && !is_fetch_exempt((string)$r['url'])) {
        try {
            $page = safe_fetch((string)$r['url'], 3_000_000);
            if ($page && $page['code'] === 200) {
                $ext = extract_listing($page['body'], (string)$r['url']);
                if (!empty($ext['photos'])) {
                    $photoUrls = array_slice($ext['photos'], 0, 10);
                }
            }
        } catch (Throwable $fe) {}
    }

    $saved = 0;
    foreach (array_slice($photoUrls, 0, 10) as $pUrl) {
        try {
            download_unit_photo($unitId, (string)$pUrl);
            $saved++;
        } catch (Throwable $e) {
            $next = (int) q_val('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM inventory_photos WHERE inventory_id = ?', [$unitId]);
            $hasPrimary = (int) q_val('SELECT COUNT(*) FROM inventory_photos WHERE inventory_id = ? AND is_primary = 1', [$unitId]);
            q('INSERT INTO inventory_photos (inventory_id, filename, thumb, sort_order, is_primary, external_url) VALUES (?, "", "", ?, ?, ?)',
                [$unitId, $next, $hasPrimary ? 0 : 1, mb_substr((string)$pUrl, 0, 700)]);
        }
    }

    // Generate & attach canonical 2-page equipment brochure
    try {
        brochure_attach_to_unit($unitId, 'admin');
    } catch (Throwable $be) {}

    // Update sourcing result record if linked
    if ($sourcingId) {
        q("UPDATE sourcing_results SET status = 'Added', inventory_id = ? WHERE id = ?", [$unitId, $sourcingId]);
        q("UPDATE inventory SET url_listing = 1 WHERE id = ?", [$unitId]);
        foreach (q('SELECT lead_id, MAX(score) s, GROUP_CONCAT(reasons SEPARATOR "; ") w FROM sourcing_matches WHERE result_id = ? AND lead_id IS NOT NULL GROUP BY lead_id', [$sourcingId])->fetchAll() as $m) {
            q("INSERT IGNORE INTO unit_lead_matches (inventory_id, lead_id, score, reasons, status, followup, followup_at) VALUES (?,?,?,?,'Saved','sourcing',NOW())", [$unitId, $m['lead_id'], $m['s'], mb_substr((string) $m['w'], 0, 250)]);
        }
    }

    return $unitId;
}

/**
 * Parse daily sweep text pasted from Gmail, Grok, Gemini, or URL lists.
 * Accepts:
 * - JSON array of listings
 * - CSV with header row
 * - Markdown / plain-text email with listing URLs, titles, prices, locations, hours
 */
function parse_daily_sweep_text(string $text): array
{
    $text = trim($text);
    if ($text === '') { return []; }

    // 1. JSON
    if (str_starts_with($text, '[') || str_starts_with($text, '{')) {
        $j = json_decode($text, true);
        if (is_array($j)) {
            return array_is_list($j) ? $j : (array) ($j['results'] ?? $j['listings'] ?? []);
        }
    }

    // 2. CSV
    if (str_contains($text, "\n") && (str_contains($text, 'url,') || str_contains($text, 'URL,') || str_contains($text, 'title,'))) {
        $rows = csv_text_rows($text);
        if ($rows) { return $rows; }
    }

    // 3. Multi-listing text / email parsing
    preg_match_all('~https?://[^\s)<>"\'\]]+~i', $text, $allMatches, PREG_OFFSET_CAPTURE);
    $all = $allMatches[0] ?? [];
    $urls = [];
    foreach ($all as $item) {
        $uStr = rtrim($item[0], ".,;:)\"']> \t\r\n");
        // Image files belong to listings as photos, not as separate listing entries
        if (!preg_match('/\.(?:jpe?g|png|webp|gif)(?:\?.*)?$/i', $uStr)) {
            $urls[] = $item;
        }
    }

    if (!$urls) {
        $lines = array_filter(array_map('trim', explode("\n", $text)));
        $rows = [];
        foreach ($lines as $ln) {
            if ($ln === '' || strlen($ln) < 5) { continue; }
            $rows[] = [
                'title' => $ln,
                'url' => '',
                'description' => $ln,
            ];
        }
        return $rows;
    }

    $n = count($urls);
    $rows = [];
    require_once BAM_ROOT . '/inc/url_import.php';

    for ($i = 0; $i < $n; $i++) {
        $rawUrl = $urls[$i][0];
        $cleanUrl = rtrim($rawUrl, ".,;:)\"']> \t\r\n");

        $start = ($i === 0) ? 0 : (int) ($urls[$i - 1][1] + strlen($urls[$i - 1][0]));
        $end = ($i + 1 < $n) ? (int) $urls[$i + 1][1] : strlen($text);
        $chunk = trim(substr($text, $start, $end - $start));

        $slug = extract_from_url_slug($cleanUrl);

        $year = null;
        if (preg_match('/\b(19[5-9]\d|20[0-3]\d)\b/', $chunk, $ym)) {
            $year = (int) $ym[1];
        } elseif (!empty($slug['year'])) {
            $year = (int) $slug['year'];
        }

        $price = null;
        $priceRaw = '';
        if (preg_match('/(?:price|ask|asking)?[^$\d\n]{0,10}\$\s*([\d,]{3,}(?:\.\d{2})?)/i', $chunk, $pm)) {
            $price = (float) str_replace(',', '', $pm[1]);
            $priceRaw = '$' . $pm[1];
        } elseif (preg_match('/(?:price|ask|asking)[:\s]+\$?\s*([\d,]{4,})\b/i', $chunk, $pm2)) {
            $price = (float) str_replace(',', '', $pm2[1]);
            $priceRaw = '$' . $pm2[1];
        }

        $hours = null;
        if (preg_match('/(?:hours|hrs|meter)[:\s\-]*([\d,]{1,6}(?:\.\d)?)\b|\b([\d,]{1,6})\s*(?:hours|hrs)\b/i', $chunk, $hm)) {
            $hours = (float) str_replace(',', '', $hm[1] ?: $hm[2]);
        }

        $location = '';
        if (preg_match('/(?:location|located in|city|hub)?[:\s\-]*([A-Z][a-zA-Z\s.-]{1,35},\s*[A-Z]{2})\b/', $chunk, $lm)) {
            $location = trim($lm[1]);
        }

        $seller = '';
        if (preg_match('/(?:seller|dealer|contact)[:\s\-]*([A-Z][a-zA-Z0-9\s.\'-]{2,40})/i', $chunk, $sm)) {
            $seller = trim($sm[1]);
        }

        $title = '';
        if (preg_match('/\b\[([^\]]+)\]\(' . preg_quote($rawUrl, '/') . '\)/', $chunk, $tm)) {
            $title = trim($tm[1]);
        } else {
            foreach (explode("\n", $chunk) as $cln) {
                $cln = trim(preg_replace('~https?://\S+~', '', $cln));
                $cln = trim(preg_replace('/^[\*\-•\d\.\)]+/', '', $cln));
                if (preg_match('/\b(19[5-9]\d|20[0-3]\d)\b/', $cln) && strlen($cln) > 8) {
                    $title = $cln;
                    break;
                }
            }
        }
        if ($title === '') {
            $title = !empty($slug['title']) ? $slug['title'] : trim(($year ? "$year " : '') . ($slug['make'] ?? '') . ' ' . ($slug['model'] ?? ''));
        }

        $make = $slug['make'] ?? '';
        $model = $slug['model'] ?? '';
        if ($make === '' && function_exists('detect_make')) {
            $mk = detect_make($title . ' ' . $chunk);
            if ($mk !== '') { $make = mb_convert_case(mb_strtolower($mk), MB_CASE_TITLE); }
        }
        if ($model === '' && $make !== '') {
            if (preg_match('/' . preg_quote($make, '/') . '\s+([A-Za-z0-9\-\.\/]+(?:\s+[A-Za-z0-9\-\.\/]+){0,3})/i', $title . ' ' . $chunk, $mcm)) {
                $mc = clean_model_and_cat($mcm[0], $make);
                $model = $mc['model'];
            }
        }

        $category = $slug['category'] ?? '';
        if ($category === '' && function_exists('type_key')) {
            $tk = type_key($title . ' ' . $model . ' ' . $chunk);
            if ($tk !== '' && defined('CATEGORY_LABELS') && isset(CATEGORY_LABELS[$tk])) {
                $category = CATEGORY_LABELS[$tk];
            }
        }

        preg_match_all('~https?://[^\s)<>"\'\]]+\.(?:jpe?g|png|webp)(?:\?[^\s)<>"\'\]]*)?~i', $chunk, $pMatches);
        $photos = array_values(array_unique(array_filter($pMatches[0] ?? [], fn($u) => !preg_match('~avatar|emoji|icon|logo~i', $u))));

        $rows[] = [
            'url' => $cleanUrl,
            'source_site' => function_exists('hub_site') ? hub_site($cleanUrl) : '',
            'listing_id' => $slug['serial'] ?? '',
            'title' => mb_substr($title, 0, 255),
            'year' => $year,
            'make' => mb_substr($make, 0, 80),
            'model' => mb_substr($model, 0, 120),
            'category' => mb_substr($category, 0, 80),
            'hours' => $hours,
            'price' => $price,
            'price_raw' => $priceRaw,
            'location' => mb_substr($location, 0, 160),
            'seller_name' => mb_substr($seller, 0, 160),
            'seller_contact' => '',
            'photos' => $photos,
            'photo_urls' => implode("\n", $photos),
            'description' => mb_substr($chunk, 0, 20000),
            'found_at' => date('Y-m-d H:i:s'),
        ];
    }

    return $rows;
}

/** Score a listing against one wanted request (0–100) + reasons. */
function wanted_score(array $w, array $r): array
{
    $s = 0; $why = [];
    $tk = type_key((string) $w['category']);
    if ($tk !== '') { if (type_key((string) $r['category']) === $tk || type_key((string) $r['title']) === $tk) { $s += 30; $why[] = 'Type'; } else { return [0, []]; } }
    $mk = make_key((string) $w['make']);
    if ($mk !== '') { if (make_key((string) $r['make']) === $mk || make_key(detect_make((string) $r['title'])) === $mk) { $s += 30; $why[] = 'Make'; } else { return [0, []]; } }
    else { $s += 10; }
    $wm = machine_norm((string) $w['model']);
    if ($wm !== '') {
        $rm = machine_norm($r['model'] . ' ' . $r['title']);
        $prim = model_primary((string) $w['model']);
        if ($prim !== '' && in_array($prim, explode(' ', $rm), true)) { $s += 25; $why[] = 'Exact model'; }
        elseif (($ser = model_series($prim)) !== '' && str_contains($rm, $ser)) { $s += 12; $why[] = 'Model series'; }
        else { $s -= 10; }
    } else { $s += 10; }
    if (!empty($w['year_min']) && !empty($r['year'])) { if ((int) $r['year'] >= (int) $w['year_min']) { $s += 5; $why[] = 'Year ≥ ' . $w['year_min']; } else { $s -= 15; } }
    if (!empty($w['year_max']) && !empty($r['year']) && (int) $r['year'] > (int) $w['year_max']) { $s -= 10; }
    if (!empty($w['hours_max']) && $r['hours'] !== null) { if ((float) $r['hours'] <= (float) $w['hours_max']) { $s += 5; $why[] = 'Hours ok'; } else { $s -= 15; } }
    if (!empty($w['budget_max']) && $r['price'] !== null && (float) $r['price'] > 0) {
        $buyer = (float) $r['price'];   // listed price, as-is (no markup)
        if ($buyer <= (float) $w['budget_max']) { $s += 10; $why[] = 'In budget'; } elseif ($buyer <= (float) $w['budget_max'] * 1.15) { $why[] = 'Near budget'; } else { $s -= 20; }
    }
    return [max(0, min(100, $s)), $why];
}

/** (Re)match one sourcing result to open wanted requests + leads. Returns match count. */
function sourcing_match_result(int $id): int
{
    $r = q_one('SELECT * FROM sourcing_results WHERE id = ?', [$id]);
    if (!$r) { return 0; }
    q('DELETE FROM sourcing_matches WHERE result_id = ?', [$id]);
    $best = 0; $n = 0;
    foreach (q("SELECT * FROM wanted_requests WHERE status = 'Open'")->fetchAll() as $w) {
        [$s, $why] = wanted_score($w, $r);
        if ($s < 50) { continue; }
        q('INSERT INTO sourcing_matches (result_id, wanted_id, lead_id, score, reasons) VALUES (?,?,?,?,?)', [$id, $w['id'], $w['lead_id'], $s, 'Wanted: ' . implode(', ', $why)]);
        $best = max($best, $s); $n++;
    }
    $pseudo = ['id' => 0, 'category' => $r['category'], 'make' => $r['make'], 'model' => $r['model'], 'year' => $r['year']];
    foreach (match_leads($pseudo, 25) as $m) {
        if ($m['score'] < 60) { continue; }
        q('INSERT INTO sourcing_matches (result_id, wanted_id, lead_id, score, reasons) VALUES (?,?,?,?,?)', [$id, null, $m['lead']['id'], $m['score'], 'Lead: ' . implode(', ', $m['reasons'])]);
        $best = max($best, $m['score']); $n++;
    }
    q('UPDATE sourcing_results SET best_score = ?, match_count = ? WHERE id = ?', [$best, $n, $id]);
    return $n;
}

/**
 * One click: sourcing result → hidden unit (Draft, or Staged for batch loads).
 * Uses the canonical pre-grab pipeline (OEM specs, 10 photos, AI description, brochure).
 */
function sourcing_to_inventory(int $id, int $userId, string $status = 'Draft', array $extraNotes = []): int
{
    $r = q_one('SELECT * FROM sourcing_results WHERE id = ?', [$id]);
    if (!$r) { throw new RuntimeException('Result not found'); }
    if ($r['inventory_id'] && q_val('SELECT id FROM inventory WHERE id = ?', [$r['inventory_id']])) { return (int) $r['inventory_id']; }
    return sourcing_row_to_pregrabbed_draft($r, $userId, $id);
}

/** Parse CSV text into assoc rows (header row required). */
function csv_text_rows(string $csv): array
{
    $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
    $fh = fopen('php://temp', 'r+'); fwrite($fh, $csv); rewind($fh);
    $head = fgetcsv($fh, 0, ',', '"', '');
    $rows = [];
    if ($head) {
        while (($l = fgetcsv($fh, 0, ',', '"', '')) !== false) {
            if ($l === [null]) { continue; }
            $rows[] = array_combine(array_map('trim', $head), array_pad(array_slice($l, 0, count($head)), count($head), ''));
        }
    }
    fclose($fh);
    return $rows;
}
