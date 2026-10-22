# Uploading to Hostinger

1. **Back up your database first** (hPanel > Databases > phpMyAdmin > Export).
2. hPanel > **File Manager**. Upload `bam-hunter-backend.zip` to your account **home folder, next to (not inside) `public_html`**,
   so nothing here is reachable from the web. Right-click the zip > **Extract**. You get a `hunter-backend-php` folder.
   (A `.htaccess` inside already blocks web access as a second layer.)
3. In that folder, copy `.env.example` to `.env` (File Manager: right-click > Copy, or create a new file) and fill in your
   database name, user and password from hPanel > Databases > Management. If you can't see dotfiles, turn on
   "Show hidden files" in File Manager settings.
4. Run the migration over SSH (hPanel > Advanced > SSH Access):
   ```
   cd ~/hunter-backend-php
   php -v                     # needs 8.3; set it in hPanel > Advanced > PHP Configuration if not
   php tests/scoring-test.php # should print PASS lines
   php bin/migrate.php        # prints what it added; safe to run twice
   ```
   No SSH? Use `migrations/001_hunter_schema.sql` in phpMyAdmin instead (read the comments at the top first).
5. Cron (hPanel > Advanced > Cron Jobs), once a day. Use the PHP 8.3 binary path hPanel shows (often `/usr/bin/php`):
   ```
   0 7 * * *  cd /home/YOURUSER/hunter-backend-php && /usr/bin/php bin/check-cold-leads.php
   ```
   The cron prints how many tasks it created and exits 0; on any error it prints "check-cold-leads failed: ..." and
   exits 1, so hPanel's cron e-mail shows the failure.
6. Hook it into the CRM: wherever a listing is saved or set to Live, call `matchInventory($id)` (see README.md).
   Test one listing by hand: `php bin/match-inventory.php <inventory_id>`. Leads only match once their `requirements`
   are filled in (README.md, "Open points").

Never put `.env` in `public_html` or commit it anywhere.
