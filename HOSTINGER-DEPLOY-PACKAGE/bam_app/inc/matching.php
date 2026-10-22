<?php
/** "Matching buyers": scores leads against a unit by type / make / model (+ year proximity).
 *  update_hub4: only VERIFIED URL LISTINGS (inventory.url_listing = 1) feed matches — match_pool_sql() / match_unit_ok(). */
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }

/** Upper-case tokens with - and . removed inside words: "RT-125 Quad" -> "RT125 QUAD". */
function machine_norm(string $s): string
{
    $s = strtoupper(str_replace(['-', '.', '/'], ['', '', ' '], $s));
    return trim(preg_replace('/\s+/', ' ', preg_replace('/[^A-Z0-9]+/', ' ', $s) ?? '') ?? '');
}

function model_primary(string $model): string
{
    $t = explode(' ', machine_norm($model));
    foreach ($t as $tok) { if (preg_match('/\d/', $tok)) { return $tok; } }   // first token with a digit (RT125, 310L, D6T)
    return $t[0] ?? '';
}

function model_series(string $primary): string
{
    return preg_match('/^([A-Z]*\d+)/', $primary, $m) ? $m[1] : $primary;   // 310L -> 310, D6T -> D6, RT125 -> RT125
}

// ---------------------------------------------------------------- update_hub4: matching pool
/**
 * Lead matching (Hub matches, unit ↔ lead lists, Buyer Finder, auto-match on Live, the new-lead worker) uses ONLY units that came in
 * through a listing URL (inventory.url_listing = 1: URL uploader / Add from URL) AND were VERIFIED by Admin. Old imports, legacy and
 * hand-entered units stay in their tabs but no longer feed matches. Before the hub4 column exists everything behaves as before.
 */
function match_pool_ready(): bool
{
    static $ok = null;
    if ($ok === null) { try { q('SELECT url_listing FROM inventory LIMIT 0'); $ok = true; } catch (Throwable $e) { $ok = false; } }
    return $ok;
}
/** SQL condition for the matching pool (alias $a). */
function match_pool_sql(string $a = 'i'): string
{
    $p = $a !== '' ? $a . '.' : '';
    return match_pool_ready() ? "({$p}url_listing = 1 AND {$p}verified_at IS NOT NULL)" : '1=1';
}
/** May this unit row feed lead matching? Pseudo units (id 0, e.g. a sourcing result) are not inventory and stay allowed. */
function match_unit_ok(array $u): bool
{
    $id = (int) ($u['id'] ?? 0);
    if ($id <= 0 || !match_pool_ready()) { return true; }
    if (array_key_exists('url_listing', $u) && array_key_exists('verified_at', $u)) { return (int) $u['url_listing'] === 1 && !empty($u['verified_at']); }
    return (bool) q_val('SELECT 1 FROM inventory i WHERE i.id = ? AND ' . match_pool_sql('i'), [$id]);
}

function match_leads(array $u, int $limit = 60, bool $allowAnyUnit = false): array
{
    if (!$allowAnyUnit && !match_unit_ok($u)) { return []; }   // update_hub4: only verified URL listings feed matches unless allowAnyUnit is true
    $tk = type_key((string) $u['category']);
    $mk = make_key((string) $u['make']);
    $primary = model_primary((string) $u['model']);
    $series = model_series($primary);
    $or = []; $p = [];
    if ($tk !== '') { $or[] = 'type_key = ?'; $p[] = $tk; }
    if ($mk !== '') { $or[] = 'brand_key = ?'; $p[] = $mk; $or[] = 'machine_make_key = ?'; $p[] = $mk; }
    if (strlen($series) >= 2) { $or[] = 'machine_norm LIKE ?'; $p[] = '%' . $series . '%'; }
    if (!$or) { return []; }
    $cands = q('SELECT * FROM leads WHERE ' . implode(' OR ', $or) . ' ORDER BY lead_date DESC, id DESC LIMIT 4000', $p)->fetchAll();
    $saved = q('SELECT lead_id, status, note FROM unit_lead_matches WHERE inventory_id = ?', [(int) $u['id']])->fetchAll(PDO::FETCH_UNIQUE);
    $out = [];
    foreach ($cands as $l) {
        [$score, $why] = match_score($u, $l, $tk, $mk, $primary, $series);
        if ($score < 30) { continue; }
        $s = $saved[$l['id']] ?? null;
        if ($s && $s['status'] === 'Dismissed') { continue; }
        $out[] = ['lead' => $l, 'score' => min(100, $score), 'reasons' => $why, 'saved' => $s];
    }
    usort($out, fn($a, $b) => [(int) (bool) $b['saved'], $b['score'], $b['lead']['lead_date'] ?? ''] <=> [(int) (bool) $a['saved'], $a['score'], $a['lead']['lead_date'] ?? '']);
    return array_slice($out, 0, $limit);
}

/** Recompute and persist top lead matches for a given unit ID (used by api/hub/matches.php, Hunter, and Brain matching). */
function match_leads_to_unit(int $unitId, int $limit = 25): int
{
    $u = q_one('SELECT * FROM inventory WHERE id = ?', [$unitId]);
    if (!$u) { return 0; }
    $rows = match_leads($u, $limit, true);
    $count = 0;
    // Alerts are only for scraped third-party machines (they carry a source_url) that have been verified and BAM-branded.
    $isLive = (($u['status'] ?? '') === 'Live') && !empty($u['verified_at']) && trim((string) ($u['source_url'] ?? '')) !== '';
    $unitTitle = trim(($u['year'] ? $u['year'] . ' ' : '') . ($u['make'] ?? '') . ' ' . ($u['model'] ?? '')) ?: ('Unit #' . $unitId);
    foreach ($rows as $m) {
        $lid = (int) ($m['lead']['id'] ?? 0);
        if ($lid <= 0) { continue; }
        $score = min(100, (int) ($m['score'] ?? 0));
        $reasons = mb_substr(implode(' + ', (array) ($m['reasons'] ?? [])), 0, 250);
        q("INSERT INTO unit_lead_matches (inventory_id, lead_id, score, reasons, status) VALUES (?, ?, ?, ?, 'Saved')
           ON DUPLICATE KEY UPDATE score = GREATEST(score, VALUES(score)), reasons = IF(reasons = '' OR reasons IS NULL, VALUES(reasons), reasons)",
          [$unitId, $lid, $score, $reasons]);
        // Unified >80% Urgent Alert Rule -> writes directly to tw_tasks + tw_notifications (once per lead+unit)
        if ($isLive && $score > 80) {
            try {
                $leadKey = 'db:' . $lid;
                $taskTitle = "🔥 {$score}% Match Alert: {$unitTitle}";
                $exists = q_val("SELECT id FROM tw_tasks WHERE lead_key = ? AND unit_id = ? AND status = 'open' LIMIT 1", [$leadKey, $unitId]);
                if (!$exists) {
                    $ownerId = (int) (q_val('SELECT user_id FROM tw_assign WHERE lead_key = ?', [$leadKey]) ?: 1);
                    $leadLabel = trim(($m['lead']['first_name'] ?? '') . ' ' . ($m['lead']['last_name'] ?? '')) ?: ($m['lead']['company'] ?? ('Lead #' . $lid));
                    $dueAt = date('Y-m-d H:i:s', strtotime('+2 hours'));
                    q("INSERT INTO tw_tasks (kind, title, notes, lead_key, lead_label, unit_id, assignee_id, created_by, due_at, priority, status)
                       VALUES ('task', ?, ?, ?, ?, ?, ?, 1, ?, 'urgent', 'open')",
                      [$taskTitle, 'Matched reasons: ' . $reasons, $leadKey, mb_substr($leadLabel, 0, 190), $unitId, $ownerId, $dueAt]);
                    $tid = (int) db()->lastInsertId();
                    if ($tid > 0) {
                        q("INSERT INTO tw_notifications (user_id, kind, actor_id, title, body, ref_type, ref_key)
                           VALUES (?, 'task', 1, ?, ?, 'task', ?)",
                          [$ownerId, $taskTitle, $leadLabel . ' · ' . $reasons, (string) $tid]);
                    }
                }
            } catch (Throwable) {}
        }
        $count++;
    }
    return $count;
}

/** Score one unit ↔ one lead (0–100 + reasons). Shared by match_leads(), Hunter Cockpit, and the worker's new-lead matching. */
function match_score(array $u, array $l, ?string $tk = null, ?string $mk = null, ?string $primary = null, ?string $series = null): array
{
    $tk ??= type_key((string) $u['category']);
    $mk ??= make_key((string) $u['make']);
    $primary ??= model_primary((string) $u['model']);
    $series ??= model_series($primary);
    $score = 0; $why = [];
    if ($tk !== '' && $l['type_key'] === $tk) { $score += 30; $why[] = 'Type'; }
    if ($mk !== '' && ($l['brand_key'] === $mk || $l['machine_make_key'] === $mk)) { $score += 30; $why[] = 'Make'; }
    $toks = explode(' ', (string) $l['machine_norm']);
    if ($primary !== '' && in_array($primary, $toks, true)) { $score += 35; $why[] = 'Exact model'; }
    elseif (strlen($series) >= 2) {
        foreach ($toks as $t) {
            if ($t !== '' && str_starts_with($t, $series) && !preg_match('/^\d{4}$/', $t)) { $score += 20; $why[] = 'Model series'; break; }
        }
    }
    $ly = parse_year((string) $l['machine']);
    if ($ly && !empty($u['year']) && abs($ly - (int) $u['year']) <= 3) { $score += 5; $why[] = 'Year ±3'; }
    if (!empty($l['requirements']) && is_string($l['requirements'])) {
        $req = @json_decode($l['requirements'], true);
        if (is_array($req)) {
            $budget = (float) ($req['budget_max'] ?? 0);
            $ask = (float) ($u['public_price'] ?? 0);
            if ($budget > 0 && $ask > 0 && $ask <= $budget * 1.05) { $score += 10; $why[] = 'Within budget'; }
            $maxH = (float) ($req['max_hours'] ?? 0);
            $uHours = (float) ($u['hours'] ?? 0);
            if ($maxH > 0 && $uHours > 0 && $uHours <= $maxH) { $score += 5; $why[] = 'Hours fit'; }
        }
    }
    return [min(100, $score), $why];
}

