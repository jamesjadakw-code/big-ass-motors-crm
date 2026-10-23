<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/bam.php';
require_once BAM_ROOT . '/inc/crm_boot.php';

if (!is_post()) { http_response_code(405); exit; }
csrf_check();

$id = (int) ($_POST['id'] ?? 0);
$verify = !empty($_POST['verify']);
$publish = null;

if ($verify) {
    q('UPDATE inventory SET verified_at = NOW(), verified_by = ?, updated_at = NOW() WHERE id = ?', [(int) $ME['id'], $id]);
    q("INSERT INTO crm_audit (user_id, email, role, event, detail, path, ip, ua) VALUES (?, ?, ?, 'verify_unit', ?, '', ?, '')",
        [(int) $ME['id'], $ME['email'], $ME['role'], "Verified unit $id", $_SERVER['REMOTE_ADDR']]);
    try {
        require_once BAM_ROOT . '/inc/brochure.php';
        brochure_attach_to_unit($id, $ME['name'] ?? 'admin');
    } catch (Throwable) {}
    if (is_file(BAM_ROOT . '/inc/hunter_hook.php')) {
        require_once BAM_ROOT . '/inc/hunter_hook.php';
        bam_hunter_on_unit_changed($id);
    }
    // Third-party machines: official brochure, publish (admin only) and buyer matching. See inc/verify_publish.php.
    try {
        require_once BAM_ROOT . '/inc/verify_publish.php';
        $publish = bam_verify_publish($id, $ME);
    } catch (Throwable) {}
} else {
    q('UPDATE inventory SET verified_at = NULL, verified_by = NULL, status = IF(status IN ("Live", "Pending"), "Draft", status), updated_at = NOW() WHERE id = ?', [$id]);
    q("INSERT INTO crm_audit (user_id, email, role, event, detail, path, ip, ua) VALUES (?, ?, ?, 'unverify_unit', ?, '', ?, '')",
        [(int) $ME['id'], $ME['email'], $ME['role'], "Unverified unit $id", $_SERVER['REMOTE_ADDR']]);
}

require_once BAM_ROOT . '/inc/live.php';
live_bump('inventory');

json_out(['ok' => true] + ($publish ? ['publish' => $publish] : []));
