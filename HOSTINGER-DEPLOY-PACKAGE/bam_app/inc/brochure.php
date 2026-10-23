<?php
/**
 * Brochure engine — matches James's BAM templates (brochure-refs/ref1.pdf, ref2.pdf, list_template.png).
 *  - brochure_unit_pages(): 2-page single-unit brochure (page 1: hero/description/highlights/price bar; page 2: photos/specs/notes/CTA)
 *  - brochure_cover():      cover page for a multi-unit packet
 *  - brochure_list():       list-form inventory sheet (buyer or internal columns)
 * Output is HTML sized to US Letter; the browser's Print → Save as PDF makes the PDF (no server-side PDF lib needed on Hostinger).
 * Buyer versions only ever receive rows from public_unit()/unit_public_view(), so internal fields are not even present.
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }
require_once BAM_ROOT . '/inc/oem_specs.php';

const BRO_FOOT_LEFT  = 'Big Ass Motors  •  Jacksonville, FL  •  US &amp; MX Coverage';
const BRO_FOOT_RIGHT = 'www.bigassmotors.com  •  ' . BAM_PHONE;
const BRO_DISCLAIMER = 'All equipment sold as-is. Specifications are general OEM published figures and may vary by configuration; unit details are based on owner reports. Vehicles or items pictured but not listed are not included. Buyer is responsible for final inspection. Big Ass Motors facilitates the transaction.';

function brochure_css(): string
{
    return <<<'CSS'
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:#1b1b1b;background:#d9d9d9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;height:11in;margin:18px auto;background:#fff;position:relative;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,.18);padding:.26in .5in .75in;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.bh{display:flex;justify-content:space-between;align-items:flex-start}
.bh img{width:2.5in;height:auto;display:block}
.bh .ct{text-align:right;font-size:8.3pt;font-weight:700;line-height:1.5;text-transform:uppercase;padding-top:.02in}
.bh .ct .nm{font-size:14pt;letter-spacing:.2em;font-weight:700;margin-bottom:5px}
.bh .ct .lc{text-transform:none}
.yr{height:2.5px;background:#F2C230;margin:.2in 0 .1in}
.yr2{height:2px;background:#F2C230;margin:.035in 0 0}
h1.t{font-size:20pt;text-align:center;margin:.08in 0 .06in;font-weight:700;line-height:1.15}
.st{text-align:center;color:#444;font-size:10.5pt;margin-bottom:.1in}
.band{background:#111;color:#fff;text-align:center;font-weight:700;font-size:8.6pt;padding:.1in .15in;margin:0 -.05in .13in}
.hero{border:1px solid #ddd;padding:.03in;height:3.2in;display:flex;align-items:center;justify-content:center;background:#fff}
.hero img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.hero .noph{color:#999;font-size:10pt}
h2.s{font-size:10.5pt;font-weight:700;text-transform:uppercase;margin:.14in 0 .07in;padding-bottom:.035in;border-bottom:2px solid #F2C230}
.desc{font-size:8.6pt;line-height:1.5;color:#222;margin:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:.35in}
ul.b,ol.b{margin:0;padding-left:.2in;font-size:8.6pt;line-height:1.55}
ol.b li::marker{font-weight:700}
.pricebar{position:absolute;left:.5in;right:.5in;bottom:.62in;background:#111;border:2px solid #F2C230;color:#F2C230;text-align:center;font-weight:700;font-size:11pt;padding:.1in}
.pf{position:absolute;left:0;right:0;bottom:0;height:.45in;background:#111;color:#e8e8e8;font-size:7pt;display:flex;align-items:center;justify-content:space-between;padding:0 .5in}
.pf span{flex:1}.pf span:nth-child(2){text-align:center}.pf span:last-child{text-align:right}
.t2{font-size:12pt;text-align:center;margin:.1in 0;font-weight:700}
.ph3{display:grid;grid-template-columns:repeat(3,1fr);gap:.15in;margin:.14in 0 .05in}
.ph3 div{border:1px solid #ddd;padding:.03in;height:1.6in;display:flex;align-items:center;justify-content:center}
.ph3 img{max-width:100%;max-height:100%;object-fit:cover;width:100%;height:100%;display:block}
.specbox{background:#FFFBEA;border:1.5px solid #F2C230;padding:.1in .15in;display:grid;grid-template-columns:1fr 1fr;gap:.2in;margin-bottom:.15in}
.specbox table{border-collapse:collapse;width:100%;font-size:7.6pt}
.specbox td{padding:1.4px 0;vertical-align:top;line-height:1.26}
.specbox td.k{font-weight:700;width:46%;padding-right:6px}
.cta{position:absolute;left:.5in;right:.5in;bottom:1.05in;background:#111;border:2px solid #F2C230;color:#fff;text-align:center;padding:.12in .1in .1in}
.cta .a{color:#F2C230;font-weight:700;font-size:13pt}
.cta .b{font-size:8.5pt;margin-top:2px;color:#fff}
.cta .c{font-size:16pt;font-weight:700;margin:.06in 0 .02in;color:#fff}
.cta .d{font-size:8pt;color:#F2C230}
.disc{position:absolute;left:.7in;right:.7in;bottom:.6in;text-align:center;font-size:6.3pt;color:#555;line-height:1.45}
/* cover */
.cov h1{font-size:24pt;text-align:center;margin:.2in 0 .05in}
.cov .sub{text-align:center;color:#444;font-size:10.5pt}
.cov-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.14in;margin-top:.18in}
.cov-card{border:1px solid #e1e1e1;border-top:3px solid #F2C230;padding:.05in;font-size:7.8pt}
.cov-card .im{height:1.05in;background:#f3f3f3;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cov-card img{width:100%;height:100%;object-fit:cover;display:block}
.cov-card b{display:block;font-size:8.4pt;margin:.04in 0 .01in;line-height:1.2}
.cov-card .pr{font-weight:700;color:#111}.cov-card .pg{color:#777;float:right}
.toc{width:100%;border-collapse:collapse;font-size:8.4pt;margin-top:.12in}
.toc th{background:#111;color:#F2C230;text-align:left;padding:4px 6px;font-size:7.6pt;text-transform:uppercase}
.toc td{padding:3px 6px;border-bottom:1px solid #eee}
/* list form */
.lp{width:8.5in;margin:18px auto;background:#fff;padding:.3in .35in .6in;box-shadow:0 4px 28px rgba(0,0,0,.18);position:relative;min-height:11in}
.lh{display:flex;gap:.18in;align-items:flex-start;margin-bottom:.1in}
.lh img{width:1.55in;height:auto;display:block}
.lh h1{color:#0E2A47;font-size:17pt;margin:0 0 2px;font-weight:700}
.lh .l1{font-size:8pt;color:#333}
.lh .l2{font-size:7.2pt;color:#555;margin-top:3px;line-height:1.35}
table.lt{width:100%;border-collapse:collapse;font-size:7.2pt}
table.lt thead{display:table-header-group}
table.lt th{background:#0E2A47;color:#fff;text-align:left;padding:5px 4px;font-weight:700}
table.lt td{padding:3px 4px;border-bottom:1px solid #e6e6e6;vertical-align:middle}
table.lt tr:nth-child(even) td{background:#f5f7fa}
table.lt tr{page-break-inside:avoid;break-inside:avoid}
table.lt td.n{font-weight:700;width:.22in}
table.lt td.ph{width:.62in}table.lt td.ph img{width:.58in;height:.36in;object-fit:cover;display:block}
table.lt td.ph .none{font-size:6.5pt;color:#888}
table.lt a{color:#1d4ed8}
table.lt .num{text-align:right;white-space:nowrap}
.lf{border-top:1px solid #0E2A47;color:#0E2A47;font-weight:700;font-size:7.4pt;text-align:center;padding:5px 0;margin-top:.12in}
.internal-flag{background:#b91c1c;color:#fff;font-weight:700;font-size:7.5pt;padding:3px 8px;display:inline-block;letter-spacing:.06em;margin-top:4px}
/* screen toolbar */
.tb{position:sticky;top:0;z-index:9;background:#111;color:#fff;padding:9px;text-align:center;font:14px Arial,sans-serif}
.tb button,.tb a{background:#FFC107;color:#111;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;text-decoration:none;margin:0 4px;font-size:13px}
@media print{
  body{background:#fff}.tb{display:none}
  .page{margin:0;box-shadow:none}
  .lp{margin:0;box-shadow:none;padding:.3in .35in .55in;min-height:0}
  .lf{position:fixed;left:.35in;right:.35in;bottom:.18in;margin:0;background:#fff}
}
CSS;
}

function brochure_doc_open(string $title, string $back = '', ?int $unitId = null): void
{
    header('X-Robots-Tag: noindex, nofollow');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . h($title) . '</title>'
       . '<link rel="icon" href="' . h(asset('img/favicon.png')) . '"><style>' . brochure_css() . '</style></head><body>'
       . '<div class="tb">' . h($title) . ' — <button onclick="window.print()">Print / Save as PDF</button>'
       . ($unitId ? ' <a href="' . h(url('brochure.php?type=unit&ids=' . $unitId . '&download=1')) . '" class="btn" style="background:#22c55e;color:#fff;margin-left:6px">📥 Save PDF to Downloads</a>'
                  . ' <span style="color:#7dffb0;margin:0 10px;font-size:12px;font-weight:700">✓ Saved to Listing Attachments</span>' : '')
       . ($back ? ' <a href="' . h($back) . '">Back</a>' : '') . '</div>';
}

function brochure_doc_close(): void
{
    if (isset($_GET['print'])) { echo '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},500)});</script>'; }
    echo '</body></html>';
}

if (!function_exists('asset')) {
    function asset(string $path): string {
        return (defined('BAM_BASE_URL') ? BAM_BASE_URL : '') . '/inventory/assets/' . ltrim($path, '/');
    }
}

function brochure_head_block(): string
{
    return '<div class="bh"><img src="' . h(asset('img/bam-logo.jpg')) . '" alt="Big Ass Motors"><div class="ct"><div class="nm">BIG ASS MOTORS</div>'
        . "North America's Heavy Equipment Authority<br>Est. 2012 &nbsp;•&nbsp; Family Owned &amp; Operated<br>Jacksonville, FL &nbsp;32205<br>"
        . 'Phone &nbsp;' . BAM_PHONE . '<br>Mobile &nbsp;' . BAM_PHONE2 . '<br>Email &nbsp;<span class="lc">' . BAM_EMAIL . '</span><br>Web &nbsp;<span class="lc">' . BAM_WEB . '</span><br>'
        . 'Buy &nbsp;•&nbsp; Sell &nbsp;•&nbsp; Source &nbsp;•&nbsp; Ship &nbsp;—&nbsp; US &amp; MX</div></div>';
}

function brochure_footer_bar(int $page): string
{
    return '<div class="pf"><span>' . BRO_FOOT_LEFT . '</span><span>Page ' . $page . '</span><span>' . BRO_FOOT_RIGHT . '</span></div>';
}

/** Cut text to ~$max chars at a sentence/word boundary. */
function bro_cut(string $s, int $max): string
{
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
    if (mb_strlen($s) <= $max) { return $s; }
    $cut = mb_substr($s, 0, $max);
    $p = max((int) mb_strrpos($cut, '. '), (int) mb_strrpos($cut, '! '));
    return $p > $max * 0.55 ? mb_substr($cut, 0, $p + 1) : rtrim(mb_substr($cut, 0, (int) mb_strrpos($cut, ' ')), ',;:-') . '…';
}

/**
 * Parse a (legacy Machinio-style) description into prose paragraphs, bullet items and key/value spec rows.
 * e.g. "Engine\n- John Deere 4045\n- Displacement: 4.5L" → rows [Engine => John Deere 4045, Displacement => 4.5L].
 */
function bro_parse_description(string $text): array
{
    $paras = []; $bullets = []; $rows = []; $section = ''; $lastItem = '';
    $lines = preg_split('/\R/u', $text) ?: [];
    $n = count($lines);
    for ($i = 0; $i < $n; $i++) {
        $l = trim($lines[$i]);
        if ($l === '') { continue; }
        if (preg_match('/^[-•*·–]\s*(.+)$/u', $l, $m)) {
            $item = trim($m[1]);
            if (preg_match('/^([^:]{2,40}):\s*(.+)$/u', $item, $kv)) {
                $k = trim($kv[1]); $v = trim($kv[2]);
                $ctx = ($lastItem !== '' && preg_match('/^(features|attachments?|options|equipment|extras)$/i', $section)) ? $lastItem : $section;
                $label = (in_array(mb_strtolower($k), ['model', 'serial', 'type', 'width', 'make'], true) && $ctx !== '') ? mb_substr($ctx, 0, 24) . ' ' . mb_strtolower($k) : $k;
                if (isset($rows[$label])) { $label .= ' (' . ($section ?: 'more') . ')'; }
                $rows[$label] = $v;
            } else {
                $bullets[] = $item;
                $lastItem = mb_strlen($item) <= 24 ? $item : '';
                if ($section !== '') { $rows[$section] = isset($rows[$section]) ? $rows[$section] . ' • ' . $item : $item; }
            }
            continue;
        }
        $next = '';
        for ($j = $i + 1; $j < $n; $j++) { if (trim($lines[$j]) !== '') { $next = trim($lines[$j]); break; } }
        if (mb_strlen($l) <= 40 && !preg_match('/[.!?]$/u', $l) && preg_match('/^[-•*·–]/u', $next)) { $section = rtrim($l, ':'); $lastItem = ''; continue; }
        $section = ''; $lastItem = '';
        $paras[] = $l;
    }
    return ['paras' => $paras, 'bullets' => $bullets, 'rows' => $rows];
}

/** Build every block the 2-page brochure needs from a buyer-safe unit row. */
function brochure_data(array $u, array $photos): array
{
    $title = unit_title($u);
    $p = bro_parse_description((string) ($u['description'] ?? ''));
    $cat = category_label((string) ($u['category'] ?? ''));
    $attach = array_slice(lines($u['attachments'] ?? ''), 0, 6);
    $hours = ($u['hours'] ?? null) !== null && (float) $u['hours'] > 0 ? hours_fmt($u['hours']) : '';

    // sub-title: category or included attachments
    $subParts = array_filter([$cat, ...array_slice($attach, 0, 3)]);
    $cond = trim((string) ($u['unit_condition'] ?? ''));
    $condLabel = 'USED';
    if ($cond !== '' && mb_strtolower($cond) !== 'used') {
        $condLabel = 'USED — ' . mb_strtoupper($cond);
    }
    $band = array_filter([
        $condLabel,
        $hours !== '' ? ($hours . ' Hours') : '',
        'Inspection Welcome',
        !empty($u['stock_no']) ? 'Stock ' . $u['stock_no'] : '',
    ]);

    // prose
    $prose = $p['paras'];
    $desc = $prose ? implode(' ', $prose) : '';
    if (mb_strlen($desc) < 120) {
        $desc = trim($desc . ' ' . $title . ($cat ? ' — ' . mb_strtolower($cat) : '') . ($hours !== '' ? ' with ' . $hours . ' hours' : '') . '. '
            . 'Offered by Big Ass Motors, Jacksonville, FL. Freight arranged across the US & Mexico.');
    }
    $descP1 = bro_cut($desc, 560);

    // highlights (ref: 3–6 short bullets)
    $hl = lines($u['features'] ?? '');
    if (!$hl) {
        if ($hours !== '') { $hl[] = $hours . ' hours on a ' . trim(($u['year'] ?? '') . ' ' . ($u['model'] ?? '')) . '.'; }
        foreach ($p['bullets'] as $b) { if (mb_strlen($b) <= 70) { $hl[] = $b; } }
        foreach ($p['rows'] as $k => $v) { if (count($hl) >= 4) { break; } if (mb_strlen($k . $v) < 60 && !preg_match('/serial|hours/i', $k)) { $hl[] = $k . ': ' . $v; } }
        $hl[] = 'Walk-around video and inspection details available.';
        $hl[] = 'Freight available across the US & Mexico.';
    }
    $hl = array_slice(array_values(array_unique(array_map(fn($x) => bro_cut($x, 68), $hl))), 0, 6);

    // spec rows (page 2): identity first, then AI/legacy specs, then parsed description rows, then OEM specs
    $rows = ['Year / Model' => trim(($u['year'] ?? '') . ' ' . mb_strtoupper(($u['make'] ?? '') . ' ' . ($u['model'] ?? '')))];
    if ($hours !== '') { $rows['Hours'] = $hours; }
    if ($cat) { $rows['Category'] = $cat; }
    if ($cond !== '') { $rows['Condition'] = $cond; }
    $makeModel = trim(($u['make'] ?? '') . ' ' . ($u['model'] ?? ''));
    if ($makeModel !== '') { $rows['Make / Model'] = $makeModel; }
    if (($u['undercarriage_pct'] ?? null) !== null) { $rows['Undercarriage'] = (int) $u['undercarriage_pct'] . '% remaining'; }
    if (($u['tires_pct'] ?? null) !== null) { $rows['Tires'] = (int) $u['tires_pct'] . '% remaining'; }
    if (!empty($u['serial_vin'])) { $rows['Serial / PIN'] = (string) $u['serial_vin']; }   // only present when show_serial_public = 1

    $seen = array_change_key_case(array_flip(array_keys($rows)));

    $userSpecs = unit_specs($u);
    $parsedSpecs = $p['rows'];
    if (!empty($u['description_original'])) {
        $po = bro_parse_description((string) $u['description_original']);
        $parsedSpecs = array_merge($po['rows'], $parsedSpecs);
    }
    if (!empty($u['specifications_text'])) {
        $ps = bro_parse_description((string) $u['specifications_text']);
        $parsedSpecs = array_merge($ps['rows'], $parsedSpecs);
    }
    $oemSpecs = oem_specs_for_unit($u);

    foreach ($userSpecs + $parsedSpecs + $oemSpecs as $k => $v) {
        $lk = mb_strtolower((string) $k);
        if (isset($seen[$lk]) || in_array($lk, ['hours', 'year', 'make', 'model', 'category', 'condition'], true) || preg_match('/^serial/i', (string) $k)) { continue; }
        $seen[$lk] = 1;
        $rows[(string) $k] = bro_cut((string) $v, 65);
        if (count($rows) >= 30) { break; }
    }

    // Specs at a glance (Page 1 right column): top 7 key machine facts
    $glance = [];
    if ($hours !== '') { $glance['Hours'] = $hours; }
    if ($cat) { $glance['Category'] = $cat; }
    if ($cond !== '') { $glance['Condition'] = $cond; }
    if ($makeModel !== '') { $glance['Make / Model'] = $makeModel; }
    foreach (['Configuration', 'Engine', 'Horsepower', 'Gross Power', 'Net Horsepower', 'Thrust / Pullback', 'Operating Weight', 'Pullback', 'Tracks', 'Undercarriage'] as $gk) {
        foreach ($rows as $rk => $rv) {
            if (mb_strtolower($rk) === mb_strtolower($gk) && !isset($glance[$rk])) {
                $glance[$rk] = $rv;
                break;
            }
        }
        if (count($glance) >= 7) { break; }
    }
    if (count($glance) < 7) {
        foreach ($rows as $rk => $rv) {
            if (!isset($glance[$rk]) && !in_array(mb_strtolower($rk), ['year / model', 'serial / pin'], true)) {
                $glance[$rk] = $rv;
                if (count($glance) >= 7) { break; }
            }
        }
    }

    // page-2 notes
    $rest = mb_substr($desc, mb_strlen($descP1));
    $notes = trim($rest) !== '' ? bro_cut(trim($rest), 520)
        : 'Unit details are based on owner reports. Confirm hour meter, serial and a full inspection before deposit. '
          . 'Items shown in photos but not listed are not included. BAM can arrange freight across the US & Mexico.';

    return ['title' => $title, 'sub' => ($cat ?: implode('  •  ', $subParts)), 'band' => $band, 'desc' => $descP1, 'hl' => $hl,
            'glance' => $glance, 'attach' => $attach, 'rows' => $rows, 'notes' => $notes, 'hero' => $photos[0] ?? null, 'more' => array_slice($photos, 1, 3),
            'price' => unit_price_label($u), 'short' => trim($title . ($cat ? '  •  ' . $cat : ''))];
}

/** The 2-page single-unit brochure (ref1 / ref2 layout). */
function brochure_unit_pages(array $u, array $photos, int $pageStart = 1): string
{
    $d = brochure_data($u, $photos);
    $pending = ($u['status'] ?? '') === 'Pending';
    $priceTxt = $pending ? 'SALE PENDING' : ($d['price'] === 'Call for Price' ? 'CALL FOR PRICE' : 'PRICE: ' . $d['price']);
    $img = fn($ph) => $ph ? '<img src="' . h(photo_url($ph)) . '" alt="">' : '';
    ob_start(); ?>
<section class="page">
  <?= brochure_head_block() ?>
  <div class="yr"></div>
  <h1 class="t"><?= h($d['title']) ?></h1>
  <?php if ($d['sub']): ?><div class="st"><?= h($d['sub']) ?></div><?php endif; ?>
  <div class="band"><?= implode('&nbsp; | &nbsp;', array_map('h', $d['band'])) ?></div>
  <div class="hero"><?= $d['hero'] ? $img($d['hero']) : '<span class="noph">Photos available on request — call ' . BAM_PHONE . '</span>' ?></div>
  <h2 class="s">Unit Description</h2>
  <p class="desc"><?= h($d['desc']) ?></p>
  <div class="cols">
    <div><h2 class="s">Key Highlights</h2><ul class="b"><?php foreach ($d['hl'] as $x): ?><li><?= h($x) ?></li><?php endforeach; ?></ul></div>
    <div><h2 class="s">Specs at a Glance</h2><ul class="b"><?php foreach ($d['glance'] as $k => $v): ?><li><b><?= h($k) ?>:</b> <?= h($v) ?></li><?php endforeach; ?></ul></div>
  </div>
  <div class="pricebar"><?= h($priceTxt) ?> &nbsp;•&nbsp; <?= BAM_PHONE ?> &nbsp;•&nbsp; <?= BAM_EMAIL ?></div>
  <?= brochure_footer_bar($pageStart) ?>
</section>
<section class="page">
  <?= brochure_head_block() ?>
  <div class="yr"></div><div class="yr2"></div>
  <div class="t2"><?= h($d['short']) ?></div>
  <div class="yr2" style="margin-top:0"></div>
  <?php if ($d['more']): ?><div class="ph3"><?php foreach ($d['more'] as $ph): ?><div><?= $img($ph) ?></div><?php endforeach; ?></div><?php endif; ?>
  <h2 class="s">Technical Specifications — <?= h(mb_strtoupper(trim(($u['make'] ?? '') . ' ' . ($u['model'] ?? '')))) ?></h2>
  <?php $half = (int) ceil(count($d['rows']) / 2); $cols = [array_slice($d['rows'], 0, $half, true), array_slice($d['rows'], $half, null, true)]; ?>
  <div class="specbox"><?php foreach ($cols as $col): ?><table><?php foreach ($col as $k => $v): ?><tr><td class="k"><?= h($k) ?></td><td><?= h($v) ?></td></tr><?php endforeach; ?></table><?php endforeach; ?></div>
  <div class="cta"><div class="a"><?= $pending ? 'SALE PENDING — BACKUP OFFERS WELCOME' : ($d['price'] === 'Call for Price' ? 'READY TO WORK — CALL FOR PRICE' : 'READY TO WORK &nbsp;— &nbsp;' . h($d['price'])) ?></div>
    <div class="b">Call or text for a walk-around video and inspection details.</div><div class="c"><?= BAM_PHONE ?></div><div class="d"><?= BAM_EMAIL ?> &nbsp;•&nbsp; <?= BAM_WEB ?></div></div>
  <div class="disc"><?= h(BRO_DISCLAIMER) ?></div>
  <?= brochure_footer_bar($pageStart + 1) ?>
</section>
<?php
    return (string) ob_get_clean();
}

/** Cover page for a multi-unit packet: header block, title, unit cards (page refs) and a contents table. */
function brochure_cover(array $units, string $title, string $subtitle): string
{
    $cards = array_slice($units, 0, 9);
    ob_start(); ?>
<section class="page cov">
  <?= brochure_head_block() ?>
  <div class="yr"></div>
  <h1><?= h($title) ?></h1>
  <div class="sub"><?= h($subtitle) ?></div>
  <div class="band" style="margin-top:.12in">INSPECTION WELCOME &nbsp;|&nbsp; ESCROW-FRIENDLY &nbsp;|&nbsp; FREIGHT ACROSS THE US &amp; MX &nbsp;|&nbsp; CALL <?= BAM_PHONE ?></div>
  <div class="cov-grid"><?php foreach ($cards as $i => $u): ?>
    <div class="cov-card"><div class="im"><?= !empty($u['_photo']) ? '<img src="' . h(photo_url($u['_photo'], true)) . '" alt="">' : '' ?></div>
      <b><?= h(unit_title($u)) ?></b><span class="pg">p. <?= 2 + $i * 2 ?></span><?= ($u['hours'] ?? null) ? h(hours_fmt($u['hours'])) . ' hrs · ' : '' ?><span class="pr"><?= h(unit_price_label($u)) ?></span></div>
  <?php endforeach; ?></div>
  <?php if (count($units) > 9): ?>
  <table class="toc"><thead><tr><th>#</th><th>Unit</th><th>Category</th><th>Hours</th><th>Price</th><th>Page</th></tr></thead><tbody>
  <?php foreach (array_slice($units, 9, 14, true) as $i => $u): ?><tr><td><?= $i + 1 ?></td><td><?= h(unit_title($u)) ?></td><td><?= h(category_label((string) $u['category'])) ?></td><td><?= h(hours_fmt($u['hours'])) ?></td><td><?= h(unit_price_label($u)) ?></td><td><?= 2 + $i * 2 ?></td></tr><?php endforeach; ?>
  </tbody></table><?php endif; ?>
  <div class="cta" style="bottom:.62in"><div class="a">EVERY UNIT READY TO MOVE</div><div class="b">Call or text for photos, inspection reports and freight quotes.</div><div class="c"><?= BAM_PHONE ?> &nbsp;·&nbsp; <?= BAM_PHONE2 ?></div><div class="d"><?= BAM_EMAIL ?> &nbsp;•&nbsp; <?= BAM_WEB ?></div></div>
  <?= brochure_footer_bar(1) ?>
</section>
<?php
    return (string) ob_get_clean();
}

/**
 * List-form inventory sheet (list_template.png). $internal = true adds Location / Seller / Seller ask / status / source link.
 * Buyer version: #, Photo, Unit, Category, Hours, Price, Listing.
 */
function brochure_list(array $units, string $title, string $sub1, string $sub2, bool $internal): string
{
    $site = rtrim((string) cfg('app.site_url', 'https://www.bigassmotors.com'), '/');
    ob_start(); ?>
<div class="lp">
  <div class="lh"><img src="<?= h(asset('img/bam-logo.jpg')) ?>" alt="Big Ass Motors"><div>
    <h1><?= h($title) ?></h1><div class="l1"><?= h($sub1) ?></div><div class="l2"><?= h($sub2) ?></div>
    <?php if ($internal): ?><div class="internal-flag">INTERNAL — CONTAINS SELLER / LOCATION / COST. DO NOT SEND TO BUYERS.</div><?php endif; ?></div></div>
  <table class="lt"><thead><tr><th>#</th><th>Photo</th><th>Unit</th>
    <?php if ($internal): ?><th>Hours</th><th>Location</th><th>Seller</th><th class="num">Seller ask</th><th class="num">BAM price</th><th>Status</th><th>Listing</th>
    <?php else: ?><th>Category</th><th class="num">Hours</th><th class="num">Price</th><th>Listing</th><?php endif; ?></tr></thead><tbody>
  <?php foreach (array_values($units) as $i => $u): $link = unit_url($u, 'list'); if ($link[0] === '/') { $link = $site . $link; } ?>
    <tr><td class="n"><?= $i + 1 ?></td>
      <td class="ph"><?= !empty($u['_photo']) ? '<img src="' . h(photo_url($u['_photo'], 'small')) . '" alt="" loading="eager">' : '<span class="none">no photo</span>' ?></td>
      <td><?= h(unit_title($u)) ?><?= !empty($u['stock_no']) ? '<br><span style="color:#777">' . h($u['stock_no']) . '</span>' : '' ?></td>
      <?php if ($internal): ?>
        <td><?= h(hours_fmt($u['hours'])) ?></td><td><?= h($u['unit_location_internal'] ?: $u['seller_location']) ?></td>
        <td><?= h($u['seller_name']) ?><?= $u['seller_contact'] ? '<br><span style="color:#777">' . h($u['seller_contact']) . '</span>' : '' ?></td>
        <td class="num"><?= h(money($u['seller_cost_ask'])) ?></td><td class="num"><?= h(unit_price_label($u)) ?></td><td><?= h($u['status']) ?></td>
        <td><a href="<?= h($link) ?>">BAM listing</a><?= $u['source_url'] ? '<br><a href="' . h($u['source_url']) . '">Source</a>' : '' ?></td>
      <?php else: ?>
        <td><?= h(category_label((string) $u['category'])) ?></td><td class="num"><?= h(hours_fmt($u['hours'])) ?></td><td class="num"><b><?= h(unit_price_label($u)) ?></b></td><td><a href="<?= h($link) ?>">View listing</a></td>
      <?php endif; ?></tr>
  <?php endforeach; ?>
  </tbody></table>
  <div class="lf">Big Ass Motors | Jacksonville, FL 32205 | <?= BAM_PHONE ?> | <?= BAM_PHONE2 ?> | <?= BAM_EMAIL ?> | <?= BAM_WEB ?></div>
</div>
<?php
    return (string) ob_get_clean();
}


/** Weekly (Monday) list: Live/Pending units that went Live or were reduced in the last $days days. */
function weekly_list_ids(int $days = 7): array
{
    return array_map('intval', q("SELECT id FROM inventory WHERE status IN ('Live','Pending')
        AND (live_at > NOW() - INTERVAL ? DAY OR price_reduced_at > NOW() - INTERVAL ? DAY)
        ORDER BY (price_reduced_at > NOW() - INTERVAL ? DAY) DESC, category, make, model", [$days, $days, $days])->fetchAll(PDO::FETCH_COLUMN));
}

/** Full buyer-safe list document (HTML string) — used by the weekly report tool. */
function weekly_list_html(array $ids, string $title): string
{
    $units = attach_primary_photos(array_values(array_filter(array_map(fn($id) => public_unit($id), $ids))));
    $new = count(array_filter($units, fn($u) => !unit_is_reduced($u)));
    $red = count($units) - $new;
    ob_start();
    brochure_doc_open($title);
    echo brochure_list($units, $title, count($units) . (count($units) === 1 ? ' unit' : ' units') . " · $new new · $red price-reduced · week of " . date('M j, Y'),
        'Prices in USD, subject to prior sale. Freight arranged across the US & Mexico. Call ' . BAM_PHONE . ' | ' . BAM_PHONE2 . '.', false);
    echo '</body></html>';
    return (string) ob_get_clean();
}

/**
 * Generates the official brochure PDF and saves it into the listing's private attachments (inventory_files).
 * Updates any existing brochure attachment for the unit so documents remain clean and current.
 */
function brochure_attach_to_unit(int $unitId, ?string $uploadedBy = 'admin'): array
{
    require_once BAM_ROOT . '/inc/pdf.php';
    require_once BAM_ROOT . '/inc/files.php';

    $u = q_one('SELECT * FROM inventory WHERE id = ?', [$unitId]);
    if (!$u) { return ['ok' => false, 'error' => 'Unit not found']; }

    $photos = unit_photos($unitId);
    $slugPart = preg_replace('/[^A-Za-z0-9_-]/', '_', trim(($u['year'] ?? '') . '_' . ($u['make'] ?? '') . '_' . ($u['model'] ?? '')));
    $stockSlug = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($u['stock_no'] ?: $unitId));

    $origName = 'BAM_Brochure_' . ($slugPart ?: 'Unit') . ($stockSlug ? '_' . $stockSlug : '') . '.pdf';
    $dir = BAM_STORAGE . '/files/' . $unitId;
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        return ['ok' => false, 'error' => 'Cannot create storage directory'];
    }

    $storedName = 'brochure_' . $unitId . '_' . bin2hex(random_bytes(6)) . '.pdf';
    $filePath = $dir . '/' . $storedName;

    $bytes = brochure_pdf($u, $photos, $filePath);
    if ($bytes <= 0 || !is_file($filePath)) {
        return ['ok' => false, 'error' => 'Failed to render brochure PDF'];
    }

    // Check if an existing brochure file exists for this unit
    $existing = q_one("SELECT * FROM inventory_files WHERE inventory_id = ? AND (original_name LIKE 'BAM_Brochure_%' OR stored_name LIKE 'brochure_%')", [$unitId]);
    if ($existing) {
        $oldPath = $dir . '/' . basename($existing['stored_name']);
        if (is_file($oldPath) && $oldPath !== $filePath) { @unlink($oldPath); }
        q("UPDATE inventory_files SET stored_name = ?, original_name = ?, mime = 'application/pdf', size_bytes = ?, uploaded_by = 'admin', created_at = NOW() WHERE id = ?",
            [$storedName, $origName, $bytes, $existing['id']]);
        $fileId = (int) $existing['id'];
    } else {
        q("INSERT INTO inventory_files (inventory_id, kind, is_public, sort_order, stored_name, original_name, mime, size_bytes, uploaded_by, created_at) VALUES (?, 'document', 1, 0, ?, ?, 'application/pdf', ?, 'admin', NOW())",
            [$unitId, $storedName, $origName, $bytes]);
        $fileId = (int) db()->lastInsertId();
    }

    return [
        'ok' => true,
        'file_id' => $fileId,
        'filename' => $origName,
        'path' => $filePath,
        'bytes' => $bytes
    ];
}

