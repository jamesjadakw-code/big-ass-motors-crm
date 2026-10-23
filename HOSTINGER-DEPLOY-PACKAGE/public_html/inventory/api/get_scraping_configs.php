<?php
/**
 * Authenticated API endpoint for Scraper Watchlists & Sourcing Command Center.
 *   GET  /inventory/api/get_scraping_configs.php
 *   POST /inventory/api/get_scraping_configs.php (save / toggle / delete)
 *
 * Authentication:
 *   - Bearer token: Authorization: Bearer <sourcing.api_token>
 *   - Custom header: X-BAM-TOKEN: <sourcing.api_token>
 *   - Or active CRM web session (for React /new/sourcing-config UI)
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bam.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

$token = (string) cfg('sourcing.api_token', '');
$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$bearer = preg_match('/^Bearer\s+(\S+)$/i', $auth, $m) ? $m[1] : '';
$xToken = (string) ($_SERVER['HTTP_X_BAM_TOKEN'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '');
$given = $bearer !== '' ? $bearer : $xToken;

$isTokenAuthed = ($token !== '' && strlen($token) >= 20 && $given !== '' && hash_equals($token, $given));

// Also permit authenticated CRM web session users (Admin, Sales, Broker)
$isSessionAuthed = false;
if (!$isTokenAuthed) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    if (!empty($_SESSION['crm_user_id']) || !empty($_SESSION['user_id']) || !empty($_SESSION['uid'])) {
        $isSessionAuthed = true;
    }
}

if (!$isTokenAuthed && !$isSessionAuthed) {
    usleep(200000);
    json_out(['ok' => false, 'error' => 'Unauthorized: Invalid token or session required.'], 401);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Ensure table exists
q("CREATE TABLE IF NOT EXISTS scraping_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    website VARCHAR(80) NOT NULL DEFAULT 'all',
    manufacturer VARCHAR(80) NOT NULL,
    model VARCHAR(120) NOT NULL DEFAULT '',
    category VARCHAR(80) NOT NULL DEFAULT '',
    year_min INT NULL,
    year_max INT NULL,
    price_min DECIMAL(12,2) NULL,
    price_max DECIMAL(12,2) NULL,
    keywords VARCHAR(255) NOT NULL DEFAULT '',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_website (website),
    INDEX idx_active (active),
    INDEX idx_mfg (manufacturer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

if ($method === 'GET') {
    $activeOnly = !isset($_GET['all']) && (($_GET['active_only'] ?? '1') !== '0');
    $website = trim((string) ($_GET['website'] ?? ''));

    $where = [];
    $params = [];

    if ($activeOnly) {
        $where[] = 'active = 1';
    }
    if ($website !== '' && $website !== 'all') {
        $where[] = '(website = ? OR website = "all")';
        $params[] = $website;
    }

    $wSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $rows = q("SELECT id, website, manufacturer, model, category, year_min, year_max, price_min, price_max, keywords, active, created_at, updated_at FROM scraping_configs $wSql ORDER BY active DESC, manufacturer ASC, model ASC", $params)->fetchAll(PDO::FETCH_ASSOC);

    // Format clean typed response
    $configs = array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'website' => (string) $r['website'],
            'manufacturer' => (string) $r['manufacturer'],
            'model' => (string) $r['model'],
            'category' => (string) $r['category'],
            'year_min' => $r['year_min'] !== null ? (int) $r['year_min'] : null,
            'year_max' => $r['year_max'] !== null ? (int) $r['year_max'] : null,
            'price_min' => $r['price_min'] !== null ? (float) $r['price_min'] : null,
            'price_max' => $r['price_max'] !== null ? (float) $r['price_max'] : null,
            'keywords' => (string) $r['keywords'],
            'active' => (int) $r['active'],
            'created_at' => (string) $r['created_at'],
            'updated_at' => (string) $r['updated_at'],
        ];
    }, $rows);

    json_out([
        'ok' => true,
        'count' => count($configs),
        'configs' => $configs
    ]);
}

// POST: Add, Edit, or Toggle watchlist configuration
if ($method === 'POST') {
    $raw = (string) file_get_contents('php://input', false, null, 0, 1024 * 1024);
    $data = json_decode($raw, true) ?: $_POST;

    $action = (string) ($data['action'] ?? 'save');
    $id = isset($data['id']) ? (int) $data['id'] : null;

    if ($action === 'toggle' && $id) {
        q('UPDATE scraping_configs SET active = IF(active=1, 0, 1) WHERE id = ?', [$id]);
        $newActive = (int) q_val('SELECT active FROM scraping_configs WHERE id = ?', [$id]);
        json_out(['ok' => true, 'id' => $id, 'active' => $newActive]);
    }

    if ($action === 'delete' && $id) {
        q('DELETE FROM scraping_configs WHERE id = ?', [$id]);
        json_out(['ok' => true, 'deleted' => $id]);
    }

    // Save or update
    $website = clean_text((string) ($data['website'] ?? 'all'), 80);
    $mfg = clean_text((string) ($data['manufacturer'] ?? $data['make'] ?? ''), 80);
    $model = clean_text((string) ($data['model'] ?? ''), 120);
    $category = clean_text((string) ($data['category'] ?? ''), 80);
    $yearMin = !empty($data['year_min']) && is_numeric($data['year_min']) ? (int) $data['year_min'] : null;
    $yearMax = !empty($data['year_max']) && is_numeric($data['year_max']) ? (int) $data['year_max'] : null;
    $priceMin = !empty($data['price_min']) && is_numeric($data['price_min']) ? (float) $data['price_min'] : null;
    $priceMax = !empty($data['price_max']) && is_numeric($data['price_max']) ? (float) $data['price_max'] : null;
    $keywords = clean_text((string) ($data['keywords'] ?? ''), 255);
    $active = isset($data['active']) ? ((int) $data['active'] ? 1 : 0) : 1;

    if ($mfg === '' && $keywords === '') {
        json_out(['ok' => false, 'error' => 'Manufacturer or search keywords required.'], 400);
    }

    // Auto-generate keywords if blank
    if ($keywords === '') {
        $keywords = trim("$mfg $model " . ($category !== 'Heavy Equipment' ? $category : ''));
    }

    if ($id && q_val('SELECT id FROM scraping_configs WHERE id = ?', [$id])) {
        q('UPDATE scraping_configs SET website=?, manufacturer=?, model=?, category=?, year_min=?, year_max=?, price_min=?, price_max=?, keywords=?, active=? WHERE id=?',
            [$website, $mfg, $model, $category, $yearMin, $yearMax, $priceMin, $priceMax, $keywords, $active, $id]);
        json_out(['ok' => true, 'updated' => $id]);
    } else {
        q('INSERT INTO scraping_configs (website, manufacturer, model, category, year_min, year_max, price_min, price_max, keywords, active) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$website, $mfg, $model, $category, $yearMin, $yearMax, $priceMin, $priceMax, $keywords, $active]);
        $newId = (int) db()->lastInsertId();
        json_out(['ok' => true, 'created' => $newId]);
    }
}

json_out(['ok' => false, 'error' => 'Method not allowed'], 405);
