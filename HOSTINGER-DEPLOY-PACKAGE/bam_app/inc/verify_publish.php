<?php
declare(strict_types=1);
/**
 * Verify -> buyers -> official brochure -> publish, for scraped third-party machines.
 * Called from public_html/inventory/api/hub/verify.php right after verified_at is set.
 *
 * Order matters:
 *   1. brochure   brochure_official_save() builds the OFFICIAL BAM brochure (specs the listing does not state are left out).
 *   2. publish    only if the brochure was built AND the machine has year + make + model AND the person is an admin.
 *   3. matching   match_leads_to_unit() runs last so the >80% urgent alerts see the unit as Live + verified.
 * Nothing here ever sends anything to a buyer. Seller name/contact/location and wholesale numbers are not touched.
 *
 * Returns ['matches' => int, 'brochure' => bool, 'published' => bool, 'notes' => string[]] (shown to the person who clicked Verify).
 * Requires the helpers the verify endpoint already loads: q(), q_one(), db().
 *
 * NOTE for Antigravity: `inventory` has no is_public column in this codebase (only inventory_files.is_public).
 * This sets inventory.is_public = 1 when that column exists, otherwise status = 'Live'. Confirm which one the public site reads.
 */
if (!function_exists('bam_verify_publish')) {
    function bam_verify_publish(int $id, ?array $me = null): array
    {
        $out = ['matches' => 0, 'brochure' => false, 'published' => false, 'notes' => []];
        $u = q_one('SELECT id, year, make, model, url_listing, verified_at, status FROM inventory WHERE id = ?', [$id]);
        if (!$u) { $out['notes'][] = 'Unit not found.'; return $out; }
        if ((int) ($u['url_listing'] ?? 0) !== 1) { $out['notes'][] = 'Not a scraped third-party listing, so it is not published.'; return $out; }
        if (empty($u['verified_at'])) { $out['notes'][] = 'Not verified.'; return $out; }

        // 1. Official brochure
        try {
            require_once BAM_ROOT . '/inc/brochure_pdf.php';
            $b = brochure_official_save($id, $me, 'verify');
            $out['brochure'] = !empty($b['ok']);
            if (!$out['brochure']) { $out['notes'][] = 'Brochure not built: ' . (string) ($b['error'] ?? 'unknown reason'); }
        } catch (Throwable $e) {
            $out['notes'][] = 'Brochure not built: ' . $e->getMessage();
        }

        // 2. Publish: only with a built brochure, the machine's basic identity, and an admin
        $identity = trim((string) ($u['year'] ?? '')) !== '' && trim((string) ($u['make'] ?? '')) !== '' && trim((string) ($u['model'] ?? '')) !== '';
        $isAdmin = (($me['role'] ?? '') === 'admin');
        if ($out['brochure'] && $identity && $isAdmin) {
            try {
                $hasPublicCol = (bool) q_one("SHOW COLUMNS FROM inventory LIKE 'is_public'");
                if ($hasPublicCol) {
                    q('UPDATE inventory SET is_public = 1, updated_at = NOW() WHERE id = ?', [$id]);
                } else {
                    q("UPDATE inventory SET status = 'Live', updated_at = NOW() WHERE id = ? AND status IN ('Draft', 'Pending')", [$id]);
                }
                $out['published'] = true;
            } catch (Throwable $e) {
                $out['notes'][] = 'Not published: ' . $e->getMessage();
            }
        } else {
            if (!$identity) { $out['notes'][] = 'Not published: year, make and model are all needed.'; }
            if ($out['brochure'] && $identity && !$isAdmin) { $out['notes'][] = 'Not published: only an admin can publish.'; }
        }

        // 3. Buyers (after publish, so urgent-alert rules see the final status)
        try {
            require_once BAM_ROOT . '/inc/matching.php';
            if (function_exists('match_leads_to_unit')) { $out['matches'] = (int) match_leads_to_unit($id, 25); }
        } catch (Throwable $e) {
            $out['notes'][] = 'Matching failed: ' . $e->getMessage();
        }

        try {
            $detail = sprintf('Verified unit %d: %d buyer match(es), brochure %s, %s', $id, $out['matches'], $out['brochure'] ? 'built' : 'NOT built', $out['published'] ? 'published' : 'not published');
            q("INSERT INTO crm_audit (user_id, email, role, event, detail, path, ip, ua) VALUES (?, ?, ?, 'verify_publish', ?, '', ?, '')",
                [(int) ($me['id'] ?? 0), (string) ($me['email'] ?? ''), (string) ($me['role'] ?? ''), $detail, (string) ($_SERVER['REMOTE_ADDR'] ?? '')]);
        } catch (Throwable $e) { /* audit failure must not undo the verify */ }

        return $out;
    }
}
