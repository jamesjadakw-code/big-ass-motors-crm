<?php
/**
 * update_brochure — the OFFICIAL BAM brochure as a real PDF (one click, Content-Disposition: attachment).
 *   File name   BAM_Brochure_<Year>_<Make>_<Model>_<Stock>.pdf
 *   Branding    the US-flag BAM logo only (bam_app/assets/bam_us_flag_logo.jpg = bam-close-kit/trust-forms/BAM_US_FLAG_LOGO.png),
 *               BAM letterhead and phones "904-767-5232" / "904-729-1051" (never +1).
 *   Content     buyer-safe row only (public_unit(): no seller, no seller ask, no unit location / ZIP); free text is scrubbed again here
 *               (lines naming a location, a seller / dealer / owner / contact, non-BAM phones, e-mails, links, the unit's own seller name,
 *               seller location or source site are dropped). Price = "Call for Price" unless show-price is on with a public price.
 *               VERIFIED units only (never Staged / Archived / Sold). Specs are never invented: empty sections are left out.
 *   Roles       Admin + Broker: any verified unit. Sales: only units tied to a lead assigned to them (inquiry / finance request / saved match /
 *               invoice / sale / e-mail draft / task on that unit). Everyone else: no.
 * update_hub4 (bro-pdf-3):
 *   Layout      rebuilt to James's example (brochure-ref/BAM_Brochure_example_20261006.pdf): page 1 letterhead, title, sub-title, black facts bar,
 *               hero photo, UNIT DESCRIPTION, KEY HIGHLIGHTS + PACKAGE INCLUDES / SPECS AT A GLANCE, black price box, black footer bar;
 *               page 2 title band, 4 x 2 photo grid, TECHNICAL SPECIFICATIONS box, notes + BUYING FROM BAM boxes, CTA box, disclaimer.
 *   Photos      local uploads first; hot-linked listing photos are fetched (public IPs only, 6 s each, 20 s per brochure) and cached in
 *               uploads/inventory/<id>/brochure_cache/ so the next build is local.
 *   Saved       Admin VERIFY (and re-verify, a unit edit, or the Admin "Rebuild brochure" button) saves the PDF on the unit as its
 *               OFFICIAL BROCHURE document: storage/files/<id>/official_brochure_<signature>.pdf + an inventory_files row (private
 *               documents folder, not the public uploads/ folder). Downloads serve the saved file and rebuild it when the unit changed.
 * Pure PHP (FPDF in bam_app/lib/fpdf); GD is used when present to normalise photos (WebP / PNG → JPEG).
 */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }
require_once BAM_ROOT . '/inc/pdf.php';
require_once BAM_ROOT . '/inc/brochure.php';

const BRO_PDF_VERSION = 'bro-pdf-6';                                    // brochure_10: max 10 photos, always exactly 2 pages
if (!defined('BAM_PDF_LOGO')) {
    define('BAM_PDF_LOGO', defined('BAM_ROOT') ? BAM_ROOT . '/assets/bam_us_flag_logo.jpg' : __DIR__ . '/../assets/bam_us_flag_logo.jpg');
}
const BRO_PDF_PHONES  = BAM_PHONE . ' | ' . BAM_PHONE2;                 // 904-767-5232 | 904-729-1051 (never +1)
const BRO_OFFICIAL_PREFIX = 'official_brochure_';                     // update_hub4: saved OFFICIAL BROCHURE in storage/files/<id>/
const BRO_FETCH_BUDGET = 90;                                           // seconds of external photo fetching per brochure (parallel prefetch first, then cached)
const BRO_HERO_PX = 1200; const BRO_GRID_PX = 600; const BRO_JPEG_Q = 80;   // resize targets (JPEG q80)
const BRO_MAX_PHOTOS = 10;                                             // page 1 hero + up to 9 on page 2; broken photos are skipped and the next one fills in
const BRO_PDF_BLOCKED_STATUS = ['Staged', 'Archived', 'Sold'];

function brochure_pdf_dir(): string { return BAM_ROOT . '/storage/brochures'; }

/** BAM_Brochure_<Year>_<Make>_<Model>_<Stock>.pdf (ASCII, safe in every OS). */
function brochure_pdf_filename(array $u): string
{
    $part = function ($v): string {
        $v = (string) $v;
        $a = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $v);
        $v = $a === false ? $v : $a;
        return trim((string) preg_replace('/_+/', '_', (string) preg_replace('/[^A-Za-z0-9\-]+/', '_', $v)), '_-');
    };
    $bits = array_values(array_filter([$part($u['year'] ?? ''), $part($u['make'] ?? ''), $part($u['model'] ?? ''), $part($u['stock_no'] ?? '')], fn($x) => $x !== '' && $x !== '0'));
    return 'BAM_Brochure_' . ($bits ? implode('_', $bits) : 'Unit_' . (int) ($u['id'] ?? 0)) . '.pdf';
}

/** Is the unit VERIFIED and in a status that may go into a buyer brochure? [ok, reason] */
function brochure_pdf_unit_ok(array $raw): array
{
    if (in_array((string) ($raw['status'] ?? ''), BRO_PDF_BLOCKED_STATUS, true)) { return [false, 'This unit is ' . $raw['status'] . ' — no buyer brochure.']; }
    return [true, ''];
}

/** Units tied to the leads assigned to this Sales user (tw_assign). Fails closed. */
function brochure_sales_unit_ok(int $uid, int $unitId): bool
{
    if ($uid <= 0 || $unitId <= 0) { return false; }
    try { $keys = q('SELECT lead_key FROM tw_assign WHERE user_id = ?', [$uid])->fetchAll(PDO::FETCH_COLUMN); } catch (Throwable $e) { return false; }
    if (!$keys) { return false; }
    $by = ['db' => [], 'inq' => [], 'fin' => []];
    foreach ($keys as $k) { if (preg_match('/^(db|inq|fin):(\d{1,10})$/', (string) $k, $m)) { $by[$m[1]][] = (int) $m[2]; } }
    $hit = function (string $sql, array $ids) use ($unitId): bool {
        if (!$ids) { return false; }
        $ids = array_values(array_unique($ids));
        try { return (bool) q_val(sprintf($sql, implode(',', array_fill(0, count($ids), '?'))), array_merge([$unitId], $ids)); } catch (Throwable $e) { return false; }
    };
    if ($hit('SELECT 1 FROM inquiries WHERE inventory_id = ? AND id IN (%s) LIMIT 1', $by['inq'])) { return true; }
    if ($hit('SELECT 1 FROM finance_requests WHERE inventory_id = ? AND id IN (%s) LIMIT 1', $by['fin'])) { return true; }
    foreach (['SELECT 1 FROM unit_lead_matches WHERE inventory_id = ? AND lead_id IN (%s) LIMIT 1', 'SELECT 1 FROM finance_requests WHERE inventory_id = ? AND lead_id IN (%s) LIMIT 1',
              'SELECT 1 FROM invoices WHERE inventory_id = ? AND lead_id IN (%s) LIMIT 1', 'SELECT 1 FROM unit_sales WHERE inventory_id = ? AND buyer_lead_id IN (%s) LIMIT 1',
              'SELECT 1 FROM email_drafts WHERE inventory_id = ? AND lead_id IN (%s) LIMIT 1'] as $sql) { if ($hit($sql, $by['db'])) { return true; } }
    $keys = array_values(array_unique(array_map('strval', $keys)));
    try { if (q_val('SELECT 1 FROM tw_tasks WHERE unit_id = ? AND lead_key IN (' . implode(',', array_fill(0, count($keys), '?')) . ') LIMIT 1', array_merge([$unitId], $keys))) { return true; } } catch (Throwable $e) { }
    return false;
}

/** May $me download the official brochure of unit $raw (full inventory row)? [ok, reason] — role first, then the unit rules. */
function brochure_pdf_can(?array $me, array $raw): array
{
    if (!$me) { return [false, 'Log in first.']; }
    $r = crm_role($me);
    if ($r === 'sales' && !brochure_sales_unit_ok((int) $me['id'], (int) $raw['id'])) { return [false, 'Sales can download brochures only for units tied to their assigned leads.']; }
    if (!in_array($r, ['admin', 'broker', 'sales'], true)) { return [false, 'Not available for this role.']; }
    return brochure_pdf_unit_ok($raw);
}

/** Drop sentences / lines that name a location, a seller / owner / contact, a non-BAM phone, an e-mail or a link. */
function bro_pdf_scrub(string $s, array $block = []): string
{
    $out = [];
    foreach (preg_split('/\R/u', $s) ?: [] as $line) {
        $keep = [];
        foreach (preg_split('/(?<=[.!?])\s+/u', $line) ?: [] as $sent) { if (!bro_pdf_unsafe($sent, $block)) { $keep[] = $sent; } }
        if ($keep) { $out[] = implode(' ', $keep); }
    }
    return trim(implode("\n", $out));
}
function bro_pdf_unsafe(string $t, array $block = []): bool
{
    if (trim($t) === '') { return false; }
    foreach ($block as $b) { if ($b !== '' && mb_stripos(str_replace([' ', '-', '.'], '', $t), $b) !== false) { return true; } }   // update_hub4: this unit's seller / source / location
    $tt = str_ireplace([BAM_PHONE, BAM_PHONE2, BAM_EMAIL, BAM_WEB, 'Big Ass Motors, Jacksonville, FL', 'Jacksonville, FL'], '', $t);
    if (preg_match('/\b(located|location|(in|at) (our|the|my) yard|yard in|lot in|pick ?up in|sellers?|owned by|consign\w*|contact|call me|text me|ask for|address|zip ?code|machine is in|unit is in|sits in)\b/iu', $tt)) { return true; }
    if (preg_match('/\b(owner\s*(:|is\b|name)|dealer\s*:|loc\.?\s*:)/iu', $tt)) { return true; }
    if (preg_match('/\b(dealer(ship)?s?|auctioneers?|our (lot|yard|store|branch)|visit us|stop by|financing through|warranty through)\b/iu', $tt)) { return true; }   // update_hub4
    if (preg_match('/\b(big\s*motor\s*traders|bigmotortraders|machinio)\b/iu', $tt)) { return true; }
    if (preg_match('/\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/u', $tt)) { return true; }                 // a phone that is not BAM's
    if (preg_match('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/iu', $tt) || preg_match('~https?://|www\.~iu', $tt)) { return true; }
    if (preg_match('/\b(in|near|at|from|out of)\s+[A-Z][a-zA-Z.\']+(\s[A-Z][a-zA-Z.\']+){0,2},?\s+(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/u', $tt)) { return true; }
    return false;
}

/** update_hub4: words that must never reach a buyer for THIS unit (its seller, dealer site, seller / unit location) — compared without spaces. */
function brochure_pdf_blocklist(int $id): array
{
    $r = q_one('SELECT seller_name, seller_location, unit_location_internal, source_url FROM inventory WHERE id = ?', [$id]) ?: [];
    $out = [];
    $add = function (string $v) use (&$out): void { $v = mb_strtolower(str_replace([' ', '-', '.'], '', trim($v))); if (mb_strlen($v) >= 4 && !in_array($v, ['bigassmotors', 'jacksonville', 'florida'], true)) { $out[$v] = true; } };
    $add((string) ($r['seller_name'] ?? ''));
    foreach (['seller_location', 'unit_location_internal'] as $k) { $loc = trim((string) ($r[$k] ?? '')); if ($loc !== '') { $add($loc); $add(explode(',', $loc)[0]); } }
    $host = strtolower((string) parse_url((string) ($r['source_url'] ?? ''), PHP_URL_HOST));
    if ($host !== '') { $parts = explode('.', preg_replace('/^www\./', '', $host)); $add($parts[count($parts) >= 2 ? count($parts) - 2 : 0]); }
    return array_keys($out);
}

/** Everything the PDF prints, from the buyer-safe row (brochure_data() of the HTML brochure, then scrubbed). */
function brochure_pdf_data(array $u, array $photos, array $block = []): array
{
    $d = brochure_data($u, $photos);
    $desc = bro_pdf_scrub((string) $d['desc'], $block);
    if (mb_strlen($desc) < 60) {
        $desc = trim($desc . ' ' . $d['title'] . '. Offered by Big Ass Motors, Jacksonville, FL. Freight arranged across the US & Mexico.');
    }
    $d['desc'] = $desc;
    $d['notes'] = bro_pdf_scrub((string) $d['notes'], $block) ?: 'Unit details are based on owner reports. Confirm hour meter, serial and a full inspection before deposit. Items shown in photos but not listed are not included.';
    $d['hl'] = array_values(array_filter($d['hl'], fn($x) => !bro_pdf_unsafe((string) $x, $block)));
    $d['attach'] = array_values(array_filter($d['attach'], fn($x) => !bro_pdf_unsafe((string) $x, $block)));
    $d['sub'] = bro_pdf_unsafe((string) $d['sub'], $block) ? category_label((string) ($u['category'] ?? '')) : (string) $d['sub'];
    $rows = [];
    foreach ($d['rows'] as $k => $v) {
        if (preg_match('/locat|seller|owner|contact|address|zip|phone|e-?mail|yard|dealer|source|url|link/i', (string) $k) || bro_pdf_unsafe((string) $v, $block) || bro_pdf_unsafe((string) $k, $block)) { continue; }
        $rows[(string) $k] = (string) $v;
    }
    $d['rows'] = $rows;
    $pending = ($u['status'] ?? '') === 'Pending';
    $d['price_txt'] = $pending ? 'SALE PENDING' : ($d['price'] === 'Call for Price' ? 'CALL FOR PRICE' : 'PRICE: ' . $d['price']);
    $d['cta'] = $pending ? 'SALE PENDING - BACKUP OFFERS WELCOME' : ($d['price'] === 'Call for Price' ? 'READY TO MOVE - CALL FOR PRICE' : 'READY TO MOVE - ' . $d['price']);
    return $d;
}

/** A photo as a local JPEG/PNG file FPDF can read (local upload or the hot-linked original; GD normalises when present). '' = unusable. */
function brochure_pdf_photo_file(array $ph, int $unitId, string $tmpDir, int $maxPx = BRO_GRID_PX): string
{
    $data = null;
    if (($ph['filename'] ?? '') !== '') {
        $f = BAM_UPLOADS . '/inventory/' . $unitId . '/' . basename((string) $ph['filename']);
        if (is_file($f) && filesize($f) < 25 * 1048576) { $data = (string) file_get_contents($f); }
    } else {   // update_hub4: hot-linked listing photo → cached in uploads/inventory/<id>/brochure_cache/ (fetched once, within the time budget)
        $url = (string) ($ph['external_url'] ?? '');
        $cdir = BAM_UPLOADS . '/inventory/' . $unitId . '/brochure_cache';
        $cf = $cdir . '/' . substr(sha1($url), 0, 24) . '.img';
        if ($url !== '' && is_file($cf) && filesize($cf) > 0) { $data = (string) file_get_contents($cf); }
        elseif ($url !== '' && brochure_pdf_budget_left()) {
            $data = brochure_pdf_fetch($url);
            if (is_string($data) && $data !== '' && @getimagesizefromstring($data)) {
                if (!is_dir($cdir)) { @mkdir($cdir, 0755, true); }
                if (is_dir($cdir) && is_writable($cdir)) { $t = $cf . '.' . bin2hex(random_bytes(3)) . '.tmp'; if (@file_put_contents($t, $data) === strlen($data)) { @rename($t, $cf); } else { @unlink($t); } }
            }
        }
    }
    if (!is_string($data) || $data === '') { return ''; }
    $info = @getimagesizefromstring($data);
    if (!$info || $info[0] < 40 || $info[1] < 40) { return ''; }
    $out = $tmpDir . '/p' . (int) ($ph['id'] ?? mt_rand()) . '_' . $maxPx . '_' . substr(md5($data), 0, 8);
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($data);
        if ($im !== false) {
            $w = imagesx($im); $h = imagesy($im); $s = min(1, $maxPx / max($w, $h));
            $nw = max(1, (int) round($w * $s)); $nh = max(1, (int) round($h * $s));
            $dst = imagecreatetruecolor($nw, $nh); imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
            imagecopyresampled($dst, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $ok = imagejpeg($dst, $out . '.jpg', BRO_JPEG_Q);
            imagedestroy($im); imagedestroy($dst);
            return $ok ? $out . '.jpg' : '';
        }
    }
    if ($info[2] === IMAGETYPE_JPEG) { file_put_contents($out . '.jpg', $data); return $out . '.jpg'; }
    if ($info[2] === IMAGETYPE_PNG && ord($data[28] ?? "\0") === 0) { file_put_contents($out . '.png', $data); return $out . '.png'; }   // non-interlaced PNG only
    return '';
}

/** Fetch every not-yet-cached hot-linked photo of a unit in parallel (8 at a time, 8 s each, public IPs only, no redirects here; a redirected
 *  photo is retried one by one later). Fills uploads/inventory/<id>/brochure_cache/. */
function brochure_pdf_prefetch(array $photos, int $unitId): void
{
    if (!function_exists('curl_multi_init')) { return; }
    $cdir = BAM_UPLOADS . '/inventory/' . $unitId . '/brochure_cache'; $todo = [];
    foreach ($photos as $ph) {
        $url = (string) ($ph['external_url'] ?? '');
        if (($ph['filename'] ?? '') !== '' || $url === '') { continue; }
        $cf = $cdir . '/' . substr(sha1($url), 0, 24) . '.img';
        if (is_file($cf) && filesize($cf) > 0) { continue; }
        $p = parse_url($url); $host = (string) ($p['host'] ?? '');
        if (!$p || !in_array(strtolower((string) ($p['scheme'] ?? '')), ['http', 'https'], true) || $host === '') { continue; }
        $ips = @gethostbynamel($host) ?: []; if (!$ips) { continue; }
        foreach ($ips as $ip) { if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) { continue 2; } }
        $port = (int) ($p['port'] ?? (strtolower((string) $p['scheme']) === 'https' ? 443 : 80));
        $todo[$url] = [$cf, $host . ':' . $port . ':' . $ips[0]];
    }
    if (!$todo) { return; }
    if (!is_dir($cdir)) { @mkdir($cdir, 0755, true); }
    if (!is_dir($cdir) || !is_writable($cdir)) { return; }
    foreach (array_chunk($todo, 8, true) as $batch) {
        if (!brochure_pdf_budget_left()) { return; }
        $mh = curl_multi_init(); $hs = [];
        foreach ($batch as $url => [$cf, $res]) {
            $c = curl_init($url);
            curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8, CURLOPT_RESOLVE => [$res],
                CURLOPT_USERAGENT => 'Mozilla/5.0 (BAM brochure)', CURLOPT_MAXFILESIZE => 12 * 1048576]);
            curl_multi_add_handle($mh, $c); $hs[$url] = $c;
        }
        do { $st = curl_multi_exec($mh, $run); if ($run) { curl_multi_select($mh, 1.0); } } while ($run && $st === CURLM_OK);
        foreach ($hs as $url => $c) {
            $b = curl_multi_getcontent($c); $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
            if ($code === 200 && is_string($b) && $b !== '' && strlen($b) <= 12 * 1048576 && @getimagesizefromstring($b)) {
                $cf = $batch[$url][0]; $t = $cf . '.' . bin2hex(random_bytes(3)) . '.tmp';
                if (@file_put_contents($t, $b) === strlen($b)) { @rename($t, $cf); } else { @unlink($t); }
            }
            curl_multi_remove_handle($mh, $c); curl_close($c);
        }
        curl_multi_close($mh);
    }
}

/** Per-render photo stats (photos total / used / skipped, pages) — read by the installer smoke and logged on skips. */
function brochure_pdf_stats(?array $set = null): array { static $s = []; if ($set !== null) { $s = $set; } return $s; }

/** External photo fetching shares one time budget per brochure build (BRO_FETCH_BUDGET seconds). */
function brochure_pdf_budget_left(?float $reset = null): bool
{
    static $t0 = null;
    if ($reset !== null) { $t0 = $reset; return true; }
    $t0 ??= microtime(true);
    return microtime(true) - $t0 < BRO_FETCH_BUDGET;
}

/** GET a public http(s) image: public IPs only (no internal hosts), 2 redirects, 6 s, 12 MB. */
function brochure_pdf_fetch(string $url, int $hops = 2): ?string
{
    $p = parse_url($url);
    if (!$p || !in_array(strtolower((string) ($p['scheme'] ?? '')), ['http', 'https'], true) || empty($p['host']) || !function_exists('curl_init')) { return null; }
    $host = (string) $p['host'];
    $ips = @gethostbynamel($host) ?: [];
    if (!$ips) { return null; }
    foreach ($ips as $ip) { if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) { return null; } }
    $port = (int) ($p['port'] ?? (strtolower((string) $p['scheme']) === 'https' ? 443 : 80));
    $buf = ''; $max = 12 * 1048576;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6,
        CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $ips[0]], CURLOPT_USERAGENT => 'Mozilla/5.0 (BAM brochure)', CURLOPT_HEADER => false,
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$buf, $max) { $buf .= $chunk; return strlen($buf) > $max ? 0 : strlen($chunk); }]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    curl_close($ch);
    if ($code >= 300 && $code < 400 && $loc !== '' && $hops > 0) { return brochure_pdf_fetch($loc, $hops - 1); }
    return $code === 200 && $buf !== '' && strlen($buf) <= $max ? $buf : null;
}

/** cp1252 text for FPDF (keeps the bullet and the em dash James's example uses). */
function bro_txt(?string $s): string
{
    $s = str_replace(['→', "\u{2605}", '·', "\u{2009}", "\u{00A0}"], ['->', '*', "\u{2022}", ' ', ' '], (string) $s);
    $o = @iconv('UTF-8', 'windows-1252//TRANSLIT//IGNORE', $s);
    return $o === false ? (string) preg_replace('/[^\x20-\x7E\n]/', '', $s) : $o;
}

class BamBrochurePdf extends BamPdf
{
    public string $docLabel = 'Official Brochure';
    const Y = [255, 193, 7];
    function Header(): void   // James's example: US-flag logo left, BAM letterhead right, yellow rule
    {
        $W = $this->GetPageWidth();
        if (is_file(BAM_PDF_LOGO)) { $this->Image(BAM_PDF_LOGO, 11.8, 7, 54); }
        $this->SetTextColor(20, 20, 20);
        $this->SetFont('Helvetica', 'B', 15); $t = 'BIG ASS MOTORS'; $sp = 1.6;   // letter-spaced like the example (PDF Tc, points)
        $tw = $this->GetStringWidth($t) + (strlen($t) - 1) * $sp / $this->k;
        $this->SetXY($W - 14 - $tw, 8.5); $this->_out(sprintf('%.3F Tc', $sp)); $this->Cell($tw, 7, $t); $this->_out('0 Tc');
        $this->SetXY(80 + $this->cMargin, 16);
        $this->SetFont('Helvetica', 'B', 7.4);
        foreach (["NORTH AMERICA'S HEAVY EQUIPMENT AUTHORITY", "EST. 2012  \u{2022}  FAMILY OWNED & OPERATED", 'JACKSONVILLE, FL  32205', 'PHONE  ' . BAM_PHONE, 'MOBILE  ' . BAM_PHONE2,
                  'EMAIL  ' . BAM_EMAIL, 'WEB  ' . BAM_WEB, "BUY  \u{2022}  SELL  \u{2022}  SOURCE  \u{2022}  SHIP  \u{2014}  US & MX"] as $l) { $this->Cell($W - 94, 3.72, bro_txt($l), 0, 2, 'R'); }
        $this->SetDrawColor(...self::Y); $this->SetLineWidth(0.7); $this->Line(14, 51.5, $W - 14, 51.5); $this->SetLineWidth(0.2);
        $this->SetY(54);
    }
    function Footer(): void   // black bar: BAM · US & MX | Page n | web · phone
    {
        $W = $this->GetPageWidth(); $H = $this->GetPageHeight();
        $this->SetFillColor(17, 17, 17); $this->Rect(0, $H - 10, $W, 10, 'F');
        $this->SetFont('Helvetica', '', 6.8); $this->SetTextColor(235, 235, 235);
        $this->SetXY(14, $H - 10); $this->Cell(70, 10, bro_txt("Big Ass Motors  \u{2022}  Jacksonville, FL  \u{2022}  US & MX Coverage"), 0, 0, 'L');
        $this->SetXY($W / 2 - 15, $H - 10); $this->Cell(30, 10, 'Page ' . $this->PageNo(), 0, 0, 'C');
        $this->SetXY($W - 84, $H - 10); $this->Cell(70, 10, bro_txt(BAM_WEB . "  \u{2022}  " . BAM_PHONE), 0, 0, 'R');
        $this->SetTextColor(20, 20, 20);
    }
    /** Section heading with a yellow rule under it (example: UNIT DESCRIPTION). */
    function Head(string $label, float $x, float $w): void
    {
        $y = $this->GetY();
        $this->SetXY($x, $y); $this->SetFont('Helvetica', 'B', 9.6); $this->SetTextColor(20, 20, 20); $this->Cell($w, 5.6, bro_txt(mb_strtoupper($label)));
        $this->SetDrawColor(...self::Y); $this->SetLineWidth(0.6); $this->Line($x, $y + 6.4, $x + $w, $y + 6.4); $this->SetLineWidth(0.2);
        $this->SetY($y + 8.4);
    }
    /** Wrap $text into lines that fit $w at the current font. */
    function Wrap(string $text, float $w): array
    {
        $out = [];
        foreach (preg_split('/\R/', bro_txt($text)) ?: [] as $para) {
            $cur = '';
            foreach (preg_split('/\s+/', trim($para)) ?: [] as $wd) {
                if ($wd === '') { continue; }
                $try = $cur === '' ? $wd : $cur . ' ' . $wd;
                if ($this->GetStringWidth($try) <= $w - 0.5) { $cur = $try; continue; }
                if ($cur !== '') { $out[] = $cur; }
                $cur = $wd;
                while ($this->GetStringWidth($cur) > $w - 0.5 && strlen($cur) > 4) { $out[] = substr($cur, 0, 40); $cur = substr($cur, 40); }
            }
            if ($cur !== '') { $out[] = $cur; }
        }
        return $out;
    }
    /** Wrapped text, at most $max lines (the last one ends with "..." when cut). Returns the height used. */
    function Lines(float $x, float $w, float $lh, string $text, int $max, string $style = '', float $size = 8.4, array $rgb = [40, 40, 40], string $align = 'L'): float
    {
        $this->SetFont('Helvetica', $style, $size); $this->SetTextColor(...$rgb);
        $lines = $this->Wrap($text, $w);
        if (count($lines) > $max) {
            $lines = array_slice($lines, 0, $max); $l = $lines[$max - 1];
            while ($l !== '' && $this->GetStringWidth($l . '...') > $w - 0.5) { $l = substr($l, 0, -1); }
            $lines[$max - 1] = rtrim($l, ' ,;:-') . '...';
        }
        $y = $this->GetY();
        foreach ($lines as $i => $l) { $this->SetXY($x, $y + $i * $lh); $this->Cell($w, $lh, $l, 0, 0, $align); }
        $this->SetTextColor(20, 20, 20);
        $h = count($lines) * $lh; $this->SetY($y + $h); return $h;
    }
    /** One bullet line (cut to one line). */
    function Bullet(float $x, float $w, string $text, float $lh = 4.5, float $size = 8.2): void
    {
        $y = $this->GetY();
        $this->SetFont('Helvetica', '', $size); $this->SetTextColor(40, 40, 40);
        $this->SetXY($x, $y); $this->Cell(4, $lh, chr(149));
        $t = bro_txt($text); while ($t !== '' && $this->GetStringWidth($t) > $w - 6) { $t = substr($t, 0, -1); }
        if ($t !== bro_txt($text)) { $t = rtrim(substr($t, 0, -2), ' ,;:-') . '...'; }
        $this->SetXY($x + 4.5, $y); $this->Cell($w - 4.5, $lh, $t);
        $this->SetY($y + $lh);
    }
    /** Photo in a thin light frame, letter-boxed (no crop); empty frame = grey "photo on request". */
    function Photo(string $file, float $x, float $y, float $w, float $h, bool $cover = true): void
    {
        $this->SetDrawColor(205, 205, 205); $this->SetLineWidth(0.25); $this->SetFillColor(246, 246, 246); $this->Rect($x, $y, $w, $h, 'DF');
        if ($cover && $file !== '') { $file = bro_cover($file, ($w - 1.2) / max(1, $h - 1.2)); }   // fill the frame like the example (centre crop, at most 38% cut)
        $s = $file !== '' ? @getimagesize($file) : false;
        if (!$s) {
            $this->SetFont('Helvetica', 'B', 7); $this->SetTextColor(150, 150, 150); $this->SetXY($x, $y + $h / 2 - 2.5); $this->Cell($w, 5, 'MORE PHOTOS ON REQUEST', 0, 0, 'C');
            $this->SetTextColor(20, 20, 20); return;
        }
        $pw = $w - 1.2; $ph = $h - 1.2;
        $r = min($pw / $s[0], $ph / $s[1]); $iw = $s[0] * $r; $ih = $s[1] * $r;
        try { $this->Image($file, $x + 0.6 + ($pw - $iw) / 2, $y + 0.6 + ($ph - $ih) / 2, $iw, $ih); } catch (Throwable $e) { }
    }
    /** Pale-yellow spec box with a yellow border; rows = [label => value] in $cols columns. Returns the height used. */
    function SpecBox(float $x, float $y, float $w, array $rows, int $cols, float $lh = 4.35, float $size = 7.6): float
    {
        $n = (int) ceil(count($rows) / $cols); $h = $n * $lh + 4.4;
        $this->SetFillColor(255, 247, 214); $this->SetDrawColor(...self::Y); $this->SetLineWidth(0.6); $this->Rect($x, $y, $w, $h, 'DF'); $this->SetLineWidth(0.2);
        $keys = array_keys($rows); $cw = ($w - 6) / $cols;
        foreach (range(0, $cols - 1) as $c) {
            foreach (array_slice($keys, $c * $n, $n) as $i => $k) {
                $xx = $x + 3 + $c * $cw; $yy = $y + 2.2 + $i * $lh; $lw = $cw * 0.42;
                $this->SetXY($xx, $yy); $this->SetFont('Helvetica', 'B', $size); $this->SetTextColor(20, 20, 20);
                $kt = bro_txt((string) $k); while ($kt !== '' && $this->GetStringWidth($kt) > $lw - 1.5) { $kt = substr($kt, 0, -1); }
                $this->Cell($lw, $lh, $kt);
                $this->SetFont('Helvetica', '', $size); $this->SetTextColor(40, 40, 40);
                $v = bro_txt((string) $rows[$k]); $vw = $cw - $lw - 2;
                if ($this->GetStringWidth($v) > $vw) { while ($v !== '' && $this->GetStringWidth($v . '...') > $vw) { $v = substr($v, 0, -1); } $v = rtrim($v) . '...'; }
                $this->Cell($vw, $lh, $v);
            }
        }
        $this->SetTextColor(20, 20, 20);
        return $h;
    }
    /** Black box with a yellow border (price box / CTA). */
    function BlackBox(float $x, float $y, float $w, float $h): void
    {
        $this->SetFillColor(17, 17, 17); $this->SetDrawColor(...self::Y); $this->SetLineWidth(0.9); $this->Rect($x, $y, $w, $h, 'DF'); $this->SetLineWidth(0.2);
    }
}

/** Centre-crop a photo towards aspect $ar (w/h), cutting at most $maxCut of either side; the rest is letter-boxed. Returns the (new) file. */
function bro_cover(string $file, float $ar, float $maxCut = 0.38): string
{
    if (!function_exists('imagecreatefromjpeg') || !str_ends_with($file, '.jpg')) { return $file; }
    $s = @getimagesize($file); if (!$s || $s[1] <= 0) { return $file; }
    [$w, $h] = $s; $cur = $w / $h;
    if (abs($cur - $ar) / $ar < 0.02) { return $file; }
    if ($cur < $ar) { $nh = (int) max($h * (1 - $maxCut), round($w / $ar)); $nw = $w; } else { $nw = (int) max($w * (1 - $maxCut), round($h * $ar)); $nh = $h; }
    if ($nw === $w && $nh === $h) { return $file; }
    $im = @imagecreatefromjpeg($file); if ($im === false) { return $file; }
    $dst = imagecreatetruecolor($nw, $nh); imagecopy($dst, $im, 0, 0, (int) (($w - $nw) / 2), (int) (($h - $nh) * 0.6), $nw, $nh);   // a bit below centre: machines sit low in the frame
    $out = substr($file, 0, -4) . '_c' . substr(md5($ar . ':' . $maxCut), 0, 6) . '.jpg';
    $ok = imagejpeg($dst, $out, 84); imagedestroy($im); imagedestroy($dst);
    return $ok ? $out : $file;
}

/** Fit one line of text into $w by shrinking the font (min $min pt), then cutting. */
function bro_fit(BamBrochurePdf $p, string $t, float $w, string $style, float $size, float $min): array
{
    $t = bro_txt($t);
    $p->SetFont('Helvetica', $style, $size);
    while ($p->GetStringWidth($t) > $w && $size > $min) { $size -= 0.25; $p->SetFont('Helvetica', $style, $size); }
    if ($p->GetStringWidth($t) > $w) { while ($t !== '' && $p->GetStringWidth($t . '...') > $w) { $t = substr($t, 0, -1); } $t = rtrim($t, ' ,;:-') . '...'; }
    return [$t, $size];
}

function brochure_pdf_render(array $u, array $photos): string
{
    $d = brochure_pdf_data($u, $photos, brochure_pdf_blocklist((int) $u['id']));
    $tmp = sys_get_temp_dir() . '/bam_bro_' . bin2hex(random_bytes(6)); @mkdir($tmp, 0700, true);
    brochure_pdf_budget_left(microtime(true));
    @set_time_limit(300);
    brochure_pdf_prefetch(array_slice($photos, 0, BRO_MAX_PHOTOS + 6), (int) $u['id']);
    $files = []; $skipped = [];   // up to BRO_MAX_PHOTOS: hero at BRO_HERO_PX, the rest at BRO_GRID_PX; a photo that cannot be loaded is skipped (logged) and the next one fills in
    foreach ($photos as $ph) {
        if (count($files) >= BRO_MAX_PHOTOS) { break; }
        $f = brochure_pdf_photo_file($ph, (int) $u['id'], $tmp, $files ? BRO_GRID_PX : BRO_HERO_PX);
        if ($f !== '') { $files[] = $f; } else { $skipped[] = (int) ($ph['id'] ?? 0); }
    }
    if ($skipped) { error_log('brochure_pdf unit ' . (int) $u['id'] . ': ' . count($skipped) . ' photo(s) skipped (could not load): #' . implode(', #', $skipped)); }
    $cfp = $d['price'] === 'Call for Price';
    $pending = ($u['status'] ?? '') === 'Pending';
    $B = "  \u{2022}  ";
    try {
        $p = new BamBrochurePdf('P', 'mm', 'Letter'); $p->AliasNbPages(); $p->SetMargins(14, 12, 14); $p->SetAutoPageBreak(false);
        $p->SetTitle(bro_txt('BAM Brochure - ' . $d['title'])); $p->SetAuthor('Big Ass Motors LLC'); $p->SetCreator('BAM CRM ' . BRO_PDF_VERSION); $p->SetSubject('Official Brochure');
        $W = $p->GetPageWidth() - 28; $X = 14;
        // ================= page 1
        $p->AddPage();
        [$t, $fs] = bro_fit($p, $d['title'], $W, 'B', 21, 14); $p->SetXY($X, 54.5); $p->SetTextColor(20, 20, 20); $p->Cell($W, 9, $t, 0, 2, 'C');
        $y = 64.5;
        if (trim((string) $d['sub']) !== '') { [$t] = bro_fit($p, str_replace('  •  ', $B, (string) $d['sub']), $W, '', 10.5, 8); $p->SetXY($X, $y); $p->SetTextColor(85, 85, 85); $p->Cell($W, 6, $t, 0, 2, 'C'); $y += 7.5; }
        $band = implode('  |  ', array_map(fn($x) => (string) $x, $d['band']));
        $p->SetFillColor(17, 17, 17); $p->Rect($X, $y, $W, 8.5, 'F');
        [$t] = bro_fit($p, $band, $W - 6, 'B', 7.8, 6.2); $p->SetTextColor(255, 255, 255); $p->SetXY($X, $y); $p->Cell($W, 8.5, $t, 0, 0, 'C');
        $heroTop = $y + 11.5;
        // space needed below the hero: description + two columns
        $p->SetFont('Helvetica', '', 8.4); $descL = min(5, max(1, count($p->Wrap($d['desc'], $W))));
        $right = []; $rightHead = '';
        if ($d['attach']) { $rightHead = 'Package Includes'; $right = array_slice($d['attach'], 0, 7); }
        else {
            $glance = array_slice(array_filter($d['rows'], fn($v, $k) => !preg_match('/^year \/ model$/i', (string) $k), ARRAY_FILTER_USE_BOTH), 0, 7, true);
            if (count($glance) >= 3) { $rightHead = 'Specs at a Glance'; foreach ($glance as $k => $v) { $right[] = $k . ': ' . $v; } }
            else { $rightHead = 'Why Buy From BAM'; $right = ['Walk-around video on request.', 'Escrow-friendly, documented transactions.', 'Freight arranged across the US & Mexico.', 'Family owned & operated since 2012.']; }
        }
        $hl = array_slice($d['hl'], 0, 7);
        $colN = max(count($hl), count($right), 1);
        $need = 8.4 + $descL * 4.3 + 4 + 8.4 + $colN * 4.5 + 3;
        $priceY = 255;
        $heroH = max(58, min(92, $priceY - 4 - $need - $heroTop - 3));
        $p->Photo($files[0] ?? '', $X, $heroTop, $W, $heroH);
        if (!$files) { $p->SetFont('Helvetica', 'B', 11); $p->SetTextColor(90, 90, 90); $p->SetXY($X, $heroTop + $heroH / 2 + 3); $p->Cell($W, 6, bro_txt('Photos and a walk-around video on request - call ' . BAM_PHONE), 0, 0, 'C'); }
        $p->SetY($heroTop + $heroH + 4);
        $p->Head('Unit Description', $X, $W);
        $p->Lines($X, $W, 4.3, $d['desc'], $descL, '', 8.4, [35, 35, 35]);
        $p->SetY($p->GetY() + 4); $yc = $p->GetY(); $half = ($W - 10) / 2; $x2 = $X + $half + 10;
        if ($hl) { $p->Head('Key Highlights', $X, $half); foreach ($hl as $h) { $p->SetX($X); $p->Bullet($X + 1, $half - 1, (string) $h); } }
        $p->SetY($yc); $p->Head($rightHead, $x2, $half); foreach ($right as $r) { $p->Bullet($x2 + 1, $half - 1, (string) $r); }
        // price box
        $p->BlackBox($X, $priceY, $W, 11);
        $ptxt = $pending ? 'SALE PENDING' : ($cfp ? 'CALL FOR PRICE' : 'PRICE: ' . $d['price']);
        [$t] = bro_fit($p, $ptxt . $B . BAM_PHONE . $B . BAM_EMAIL, $W - 8, 'B', 12, 8); $p->SetTextColor(...BamBrochurePdf::Y); $p->SetXY($X, $priceY); $p->Cell($W, 11, $t, 0, 0, 'C');
        $p->SetTextColor(20, 20, 20);
        // ================= page 2
        $p->AddPage();
        $p->SetDrawColor(...BamBrochurePdf::Y); $p->SetLineWidth(0.7); $p->Line($X, 55.8, $X + $W, 55.8);
        $short = trim((string) $d['title']) . ($d['attach'] ? $B . 'Package' : (category_label((string) ($u['category'] ?? '')) !== '' ? $B . category_label((string) $u['category']) : ''));
        [$t] = bro_fit($p, $short, $W - 10, 'B', 13.5, 10); $p->SetTextColor(20, 20, 20); $p->SetXY($X, 57.4); $p->Cell($W, 8, $t, 0, 0, 'C');
        $p->Line($X, 67, $X + $W, 67); $p->SetLineWidth(0.2);
        // up to 9 photos (2-10) in the example's wide grid: 1-4 one row, 5-8 4 x 2, 9 = 5 + 4 (last row centred). The grid, then the spec font,
        // then the spec rows give way so the specs, the READY TO WORK box and the disclaimer always fit: 2 pages is a hard cap (no page breaks).
        $grid = array_slice($files, 1, BRO_MAX_PHOTOS - 1); $ng = count($grid);
        $cols = $ng >= 9 ? 5 : 4; $grows = $ng ? (int) ceil($ng / $cols) : 0; $gap = 3; $gw = ($W - ($cols - 1) * $gap) / $cols;
        $ctaY = 231; $top = 70.5;
        $specs = $d['rows']; $lh = 4.35; $fs = 7.6; $gh = 26;
        $specH = fn(int $n, float $lh) => (int) ceil($n / 2) * $lh + 4.4;
        $room = fn(float $gh) => $ctaY - 4 - ($top + ($grows ? $grows * ($gh + 2.2) + 2 : 0)) - 8.4;   // height left for the spec box
        while ($grows && $specH(count($specs), $lh) > $room($gh) && $gh > 18) { $gh -= 1; }
        while ($specH(count($specs), $lh) > $room($gh) && $lh > 3.55) { $lh = round($lh - 0.1, 2); $fs = max(6.6, round($fs - 0.15, 2)); }
        while (count($specs) > 2 && $specH(count($specs), $lh) > $room($gh)) { $specs = array_slice($specs, 0, count($specs) - 2, true); }   // last resort: drop trailing rows
        if (count($specs) < count($d['rows'])) { error_log('brochure_pdf unit ' . (int) $u['id'] . ': ' . (count($d['rows']) - count($specs)) . ' spec row(s) left off to keep 2 pages'); }
        $y = $top;
        if ($grows) {
            foreach ($grid as $i => $gf) {
                $r = intdiv($i, $cols); $inRow = min($cols, $ng - $r * $cols); $x0 = $X + ($W - ($inRow * $gw + ($inRow - 1) * $gap)) / 2;
                $p->Photo($gf, $x0 + ($i % $cols) * ($gw + $gap), $y + $r * ($gh + 2.2), $gw, $gh);
            }
            $y += $grows * ($gh + 2.2) + 2;
        }
        $p->SetY($y);
        $mm = mb_strtoupper(trim(($u['make'] ?? '') . ' ' . ($u['model'] ?? '')));
        $p->Head('Technical Specifications' . ($mm !== '' ? " \u{2014} " . $mm : ''), $X, $W);
        $h = $p->SpecBox($X, $p->GetY(), $W, $specs, 2, $lh, $fs);
        $y = $p->GetY() + $h + 5;
        // lower boxes: condition notes + buying from BAM (only what fits above the CTA)
        if ($ctaY - $y >= 26) {
            $half = ($W - 10) / 2; $x2 = $X + $half + 10;
            $p->SetY($y); $p->Head('Condition & Service Notes', $X, $half); $yb = $p->GetY();
            $avail = $ctaY - 4 - $yb;
            $p->SetFont('Helvetica', '', 7.6); $nl = max(1, min((int) floor(($avail - 4.4) / 3.7), count($p->Wrap($d['notes'], $half - 6))));
            $bh = $nl * 3.7 + 4.4;
            $p->SetFillColor(255, 247, 214); $p->SetDrawColor(...BamBrochurePdf::Y); $p->SetLineWidth(0.6); $p->Rect($X, $yb, $half, $bh, 'DF'); $p->SetLineWidth(0.2);
            $p->SetY($yb + 2.2); $p->Lines($X + 3, $half - 6, 3.7, $d['notes'], $nl, '', 7.6, [40, 40, 40]);
            $p->SetY($y); $p->Head('Buying From BAM', $x2, $half);
            $why = ['Walk-around video' => 'On request', 'Transaction' => 'Escrow-friendly, documented', 'Freight' => 'Arranged across the US & Mexico', 'Family owned' => 'Operating since 2012'];
            $why = array_slice($why, 0, max(1, (int) floor(($avail - 4.4) / 3.7)), true);
            $p->SpecBox($x2, $yb, $half, $why, 1, 3.7, 7.4);
        }
        // CTA
        $p->BlackBox($X, $ctaY, $W, 24);
        $cta = $pending ? "SALE PENDING \u{2014} BACKUP OFFERS WELCOME" : ($cfp ? "READY TO WORK \u{2014} CALL FOR PRICE" : "READY TO WORK \u{2014} " . $d['price']);
        [$t] = bro_fit($p, $cta, $W - 10, 'B', 13, 9); $p->SetTextColor(...BamBrochurePdf::Y); $p->SetXY($X, $ctaY + 2.2); $p->Cell($W, 6.2, $t, 0, 2, 'C');
        $p->SetFont('Helvetica', '', 8.6); $p->SetTextColor(255, 255, 255); $p->Cell($W, 4.6, bro_txt('Call or text for a walk-around video and inspection details.'), 0, 2, 'C');
        $p->SetFont('Helvetica', 'B', 15); $p->Cell($W, 7, BAM_PHONE, 0, 2, 'C');
        $p->SetFont('Helvetica', '', 7.6); $p->SetTextColor(215, 215, 215); $p->Cell($W, 4, bro_txt(BAM_EMAIL . $B . BAM_WEB), 0, 2, 'C');
        $p->SetY(257.5); $p->Lines($X + 8, $W - 16, 3.1, BRO_DISCLAIMER, 3, '', 6.4, [105, 105, 105], 'C');
        brochure_pdf_stats(['photos' => count($photos), 'used' => count($files), 'skipped' => count($skipped), 'pages' => $p->PageNo(), 'specRows' => count($specs), 'specRowsAll' => count($d['rows'])]);
        return $p->Output('S');
    } finally {
        foreach (glob($tmp . '/*') ?: [] as $f) { @unlink($f); }
        @rmdir($tmp);
    }
}

/** Signature of every input of the brochure → cache key (any change to the unit → new PDF). */
function brochure_pdf_signature(array $u, array $photos): string
{
    $ph = array_map(fn($p) => [(int) $p['id'], (string) ($p['filename'] ?? ''), (string) ($p['external_url'] ?? ''), (int) ($p['is_primary'] ?? 0), (int) ($p['sort_order'] ?? 0)], $photos);
    $logo = is_file(BAM_PDF_LOGO) ? filesize(BAM_PDF_LOGO) . ':' . filemtime(BAM_PDF_LOGO) : '-';
    return substr(hash('sha256', json_encode([BRO_PDF_VERSION, $u, $ph, setting('show_serial_public', '0'), $logo, BRO_DISCLAIMER, brochure_pdf_blocklist((int) ($u['id'] ?? 0))])), 0, 20);
}

/** update_hub4: the saved OFFICIAL BROCHURE row of a unit (inventory_files, stored_name official_brochure_<sig>.pdf) or null. */
function brochure_official_row(int $id): ?array
{
    try { return q_one("SELECT * FROM inventory_files WHERE inventory_id = ? AND kind = 'document' AND stored_name LIKE ? ORDER BY id DESC LIMIT 1", [$id, BRO_OFFICIAL_PREFIX . '%']) ?: null; }
    catch (Throwable $e) { return null; }
}
function brochure_official_dir(int $id): string { return BAM_STORAGE . '/files/' . $id; }

/**
 * update_hub4: build (or reuse when nothing changed) the OFFICIAL BROCHURE and save it on the unit: storage/files/<id>/official_brochure_<sig>.pdf
 * + one inventory_files row (replaced on every rebuild; older copies removed). Returns ok, fileId, filename, bytes, savedAt, rebuilt.
 */
function brochure_official_save(int $id, ?array $me, string $why = 'verify', bool $force = false): array
{
    $raw = q_one('SELECT id, status, verified_at FROM inventory WHERE id = ?', [$id]);
    if (!$raw) { return ['ok' => false, 'error' => 'Unit not found.']; }
    [$ok, $whyNot] = brochure_pdf_unit_ok($raw);
    if (!$ok) { return ['ok' => false, 'error' => $whyNot]; }
    $u = public_unit($id, true);
    if (!$u) { return ['ok' => false, 'error' => 'Unit not found.']; }
    $photos = unit_photos($id);
    $sig = brochure_pdf_signature($u, $photos);
    $name = brochure_pdf_filename($u);
    $dir = brochure_official_dir($id); $stored = BRO_OFFICIAL_PREFIX . $sig . '.pdf';
    $row = brochure_official_row($id);
    if (!$force && $row && $row['stored_name'] === $stored && is_file($dir . '/' . $stored) && filesize($dir . '/' . $stored) > 1000) {
        if ($row['original_name'] !== $name) { q('UPDATE inventory_files SET original_name = ? WHERE id = ?', [$name, (int) $row['id']]); }
        return ['ok' => true, 'fileId' => (int) $row['id'], 'filename' => $name, 'bytes' => (int) $row['size_bytes'], 'savedAt' => (string) $row['created_at'], 'rebuilt' => false];
    }
    $pdf = brochure_pdf_render($u, $photos);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) { return ['ok' => false, 'error' => 'Cannot create the unit documents folder.']; }
    $t = $dir . '/' . $stored . '.' . bin2hex(random_bytes(3)) . '.tmp';
    if (@file_put_contents($t, $pdf, LOCK_EX) !== strlen($pdf) || !@rename($t, $dir . '/' . $stored)) { @unlink($t); return ['ok' => false, 'error' => 'Could not save the brochure file.']; }
    foreach (glob($dir . '/' . BRO_OFFICIAL_PREFIX . '*.pdf') ?: [] as $old) { if (basename($old) !== $stored) { @unlink($old); } }
    if ($row) {
        q("UPDATE inventory_files SET stored_name = ?, original_name = ?, mime = 'application/pdf', size_bytes = ?, created_at = NOW() WHERE id = ?", [$stored, $name, strlen($pdf), (int) $row['id']]);
        q("DELETE FROM inventory_files WHERE inventory_id = ? AND kind = 'document' AND stored_name LIKE ? AND id <> ?", [$id, BRO_OFFICIAL_PREFIX . '%', (int) $row['id']]);
        $fid = (int) $row['id'];
    } else {
        q("INSERT INTO inventory_files (inventory_id, kind, is_public, stored_name, original_name, mime, size_bytes, uploaded_by) VALUES (?, 'document', 0, ?, ?, 'application/pdf', ?, 'admin')", [$id, $stored, $name, strlen($pdf)]);
        $fid = (int) db()->lastInsertId();
    }
    if (function_exists('crm_activity') && $me) { crm_activity('brochure_saved', 'unit #' . $id . ' ' . $name . ' (' . $why . ')', 'unit', (string) $id, $me); }
    return ['ok' => true, 'fileId' => $fid, 'filename' => $name, 'bytes' => strlen($pdf), 'savedAt' => date('Y-m-d H:i:s'), 'rebuilt' => true];
}

/**
 * The official brochure for unit $id: [pdfBytes, filename, fromSaved] — the saved OFFICIAL BROCHURE when it is current, else rebuilt and saved.
 * Caller has already checked brochure_pdf_can(). Throws when the unit is not brochure-able.
 */
function brochure_pdf_get(int $id): array
{
    $raw = q_one('SELECT id, status, verified_at FROM inventory WHERE id = ?', [$id]);
    if (!$raw) { throw new RuntimeException('Unit not found.'); }
    [$ok, $why] = brochure_pdf_unit_ok($raw);
    if (!$ok) { throw new RuntimeException($why); }
    $r = brochure_official_save($id, function_exists('current_user') ? current_user() : null, 'download');
    if (!empty($r['ok'])) {
        $row = brochure_official_row($id);
        $f = $row ? brochure_official_dir($id) . '/' . basename((string) $row['stored_name']) : '';
        if ($f !== '' && is_file($f)) { return [(string) file_get_contents($f), (string) $r['filename'], !$r['rebuilt']]; }
    }
    $u = public_unit($id, true);                                  // fallback: render in memory (folder not writable)
    if (!$u) { throw new RuntimeException('Unit not found.'); }
    return [brochure_pdf_render($u, unit_photos($id)), brochure_pdf_filename($u), false];
}
