# Hostinger Deployment Instructions for Big Ass Motors CRM

> **Not ready to upload yet (2026-10-22):** the Cockpit's app file (`cockpit-assets/cockpit.js`) was removed because it contained plain-text passwords. Do not upload `inventory/cockpit.php` until the Cockpit is rebuilt and connected to the database.


This package puts your local Zero-API Hunter Cockpit, canonical 2-page brochures, and matching engine onto Hostinger while keeping your existing live CRM safe as a backup.

## Architecture & Credentials
- **Zero Separate API**: Runs 100% on Hostinger PHP 8.3 + MySQL through PDO (`db()`, `q()`).
- **Existing Login Gate**: Kept behind `inventory/login.php` (`BIG ASS MOTORS · CRM` / `YOU CAN'T DEPOSIT EXCUSES`).
- **Admin**: James — `sales@bigassmotors.com` (password set in the CRM, never written here)
- **Broker**: Matt — `mattc@bigassmotors.com` (password set in the CRM, never written here)
- **Zaheed**: Deleted from `users` table.

## Quick 3-Step Upload (Hostinger File Manager)
1. **Upload `public_html/`**:
   - In Hostinger hPanel → **File Manager**, navigate into your domain's `public_html/`.
   - Upload the contents of `HOSTINGER-DEPLOY-PACKAGE/public_html/` into `public_html/` (this places `cockpit.php` and `cockpit-assets/` into `public_html/inventory/`).
2. **Upload `bam_app/`**:
   - In Hostinger File Manager, navigate into `bam_app/inc/` (one level above `public_html`).
   - Upload the updated files from `HOSTINGER-DEPLOY-PACKAGE/bam_app/inc/` (`hunter_hook.php`, `brochure.php`, `brochure_pdf.php`, `inventory.php`, `listing.php`, `roles.php`, `crm_menu.php`).
3. **Upload `hunter-backend-php/`**:
   - Upload `hunter-backend-php/` into your root directory (next to `public_html` and `bam_app`).
4. **Run User Sync (Once)**:
   - In your browser, open:
     `https://bigassmotorscrm.bigassmotors.com/inventory/update_users_hostinger.php`
   - REMOVED: the old one-click user script set fixed passwords. Do not use it; manage users in Users & roles.
5. **Access the Hunter Cockpit**:
   - Open: `https://bigassmotorscrm.bigassmotors.com/inventory/cockpit.php`
