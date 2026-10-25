<?php
/**
 * BAM CRM — Instant Inventory Purge Tool (Hostinger PHP + MySQL PDO)
 *
 * Permanently removes all machine listings, photos, files, and match references
 * to reset the CRM to 0 machines.
 *
 * Protected: Requires sign-in and admin role.
 */
declare(strict_types=1);
require __DIR__ . '/bam.php';
require_once BAM_ROOT . '/inc/crm_boot.php';

if (!crm_can('admin', $ME)) {
    http_response_code(403);
    exit('Forbidden: Only administrators can purge CRM inventory.');
}

$countBefore = (int) q_val('SELECT COUNT(*) FROM inventory');
$purged = false;
$error = null;

if (isset($_POST['confirm_purge']) || isset($_GET['confirm'])) {
    if (is_post()) {
        csrf_check();
    }
    try {
        q('DELETE FROM inventory_photos');
        try { q('DELETE FROM inventory_files'); } catch (Throwable) {}
        try { q('DELETE FROM matches'); } catch (Throwable) {}
        try { q('UPDATE email_drafts SET inventory_id = NULL'); } catch (Throwable) {}
        q('DELETE FROM inventory');
        audit('admin_purge_all_units', 'Admin ' . ($ME['email'] ?? 'James') . ' permanently purged all ' . $countBefore . ' units from CRM.');
        $purged = true;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$countAfter = (int) q_val('SELECT COUNT(*) FROM inventory');

if (isset($_GET['json'])) {
    header('Content-Type: application/json');
    echo json_encode(['ok' => $purged, 'before' => $countBefore, 'after' => $countAfter, 'error' => $error]);
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Purge CRM Inventory — BAM CRM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0b0f19; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 16px; }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-green { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    h1 { margin: 0 0 12px; font-size: 22px; font-weight: 800; color: #fff; text-transform: uppercase; }
    p { margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #94a3b8; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 14px 20px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 10px; cursor: pointer; text-decoration: none; border: none; box-sizing: border-box; transition: all 0.15s; }
    .btn-danger { background: #ef4444; color: #fff; margin-bottom: 12px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }
    .btn-danger:hover { background: #dc2626; transform: scale(1.01); }
    .btn-secondary { background: #1f2937; color: #e2e8f0; border: 1px solid #374151; }
    .btn-secondary:hover { background: #374151; }
    .stat { font-size: 48px; font-weight: 900; color: #fbbf24; margin: 16px 0; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <?php if ($purged): ?>
      <span class="badge badge-green">✓ Clean Slate Complete</span>
      <h1>0 Machines in CRM</h1>
      <div class="stat">0</div>
      <p>All <?= $countBefore ?> machine listings, photos, and match references have been permanently removed from the MySQL database.</p>
      <a href="/inventory/cockpit.php#/inventory" class="btn btn-secondary">← Return to CRM Dashboard</a>
    <?php else: ?>
      <span class="badge badge-amber">⚠️ Warning: Destructive Action</span>
      <h1>Purge All Machines</h1>
      <p>This will permanently delete all machine listings, photos, and match records from the CRM database.</p>
      <div class="stat"><?= $countBefore ?></div>
      <p><strong><?= $countBefore ?></strong> machine<?= $countBefore === 1 ? '' : 's' ?> currently in database.</p>
      <form method="POST">
        <?= csrf_field() ?>
        <input type="hidden" name="confirm_purge" value="1">
        <button type="submit" class="btn btn-danger" onclick="return confirm('PERMANENTLY DELETE ALL <?= $countBefore ?> MACHINES?\n\nThis will wipe all listings to 0. Cannot be undone.')">
          Confirm &amp; Delete All <?= $countBefore ?> Machines
        </button>
      </form>
      <a href="/inventory/cockpit.php#/inventory" class="btn btn-secondary">Cancel &amp; Go Back</a>
    <?php endif; ?>
  </div>
</body>
</html>
