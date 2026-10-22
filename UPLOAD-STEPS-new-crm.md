# Upload plan: the new CRM at /new/ (read-only)

Nothing in this plan has been done yet. It adds ONE new folder and changes no existing file.

Upload file: `NEW-CRM-ONLY-upload.zip` (about 0.7 MB, 29 files, only the `new/` folder).
Scanned: no test login, no real passwords.

Destination on Hostinger (site bigassmotorscrm.bigassmotors.com):

    /home/u438361596/domains/bigassmotorscrm.bigassmotors.com/public_html/new/

Result: `https://bigassmotorscrm.bigassmotors.com/new/`

## Before you start (2 minutes)

1. Confirm a fresh backup exists. hPanel > Files > Backups (daily backups are on), or keep
   `BACKUP-bigassmotorscrm-OCT22-2026.zip` from today.
2. Make sure you are signed in to the live CRM in the same browser (you will need it for the checks).
3. Check the plan expiry. Hostinger plan ends in about 13 days. Renew first so the site is not interrupted.

## Upload steps (hPanel File Manager)

1. hPanel > Websites > bigassmotorscrm.bigassmotors.com > **File Manager**.
2. Open `public_html`.
3. Check there is no `new` folder already. If one exists, stop and tell me.
4. Click **Upload**, choose `NEW-CRM-ONLY-upload.zip`.
5. Right-click the zip > **Extract** into `public_html` (so it creates `public_html/new/`).
6. Delete the uploaded zip from `public_html`.
7. Check that `public_html/new/` contains: `index.php`, `state.php`, `lib.php`, `bam.php`, `.htaccess`, and the `app` folder.
   (`.htaccess` is hidden by default. In File Manager settings, turn on "Show hidden files".)

Nothing else changes. Do not upload the big deploy zip.

## Browser checklist (about 5 minutes)

Do these in order. Stop at the first failure and send me a screenshot.

**A. Login**
1. In a private window, open `https://bigassmotorscrm.bigassmotors.com/new/`.
   Expected: it sends you to the normal CRM login page. It must NOT open the CRM without a password.
2. Sign in the normal way.
   Expected: you land back on `/new/` and see the new CRM with a gold "READ-ONLY PREVIEW" bar.
3. Open `https://bigassmotorscrm.bigassmotors.com/inventory/` in another tab.
   Expected: you are already signed in there (shared sign-in).

**B. Item counts**
4. Open `https://bigassmotorscrm.bigassmotors.com/new/?state=1`.
   Expected: a block of text that starts with `{"ok":true,"readOnly":true,"counts":{...`.
5. Read the `counts` line: `units`, `leads`, `tasks`, `users`.
   - leads should be close to 2,375 if you are an admin (a sales rep sees only their own leads).
   - units should match the Inventory page in the old CRM, minus Archived ones (the limit is 500).
   - If a count is 0, tell me. That is the query failing; it is not a crash.
6. In the new CRM, open Leads and Inventory. Spot-check three leads and three units against the old pages.

**C. Photo paths**
7. In the `?state=1` text, search (Ctrl+F) for `"media"` on a unit that has photos.
   Expected: web addresses like `https://www.bigassmotors.com/uploads/inventory/1234/xxxx.jpg`
   or `https://i.machineryhost.com/...`.
8. Copy one address into a new tab. Expected: the photo opens.
9. In the new CRM, open that unit. Expected: the photo shows. A unit with no photos shows no picture, not a broken one.

**D. Safety checks**
10. In the `?state=1` text, search for these. Expected: **no matches** for any of them:
    `seller_name`, `seller_contact`, `seller_location`, `password`.
    (If you are a sales rep, also no `askPrice` or `buyPrice`.)
11. Open `https://bigassmotorscrm.bigassmotors.com/new/lib.php`.
    Expected: "Forbidden" (blocked), not a page of code.
12. In the new CRM, change something (for example edit a lead) and reload.
    Expected: the change is gone. Nothing was saved to the database.
13. Check the old CRM still works: Dashboard, Leads, Inventory.

## If anything goes wrong (rollback, 1 minute)

Delete the folder `public_html/new/` in File Manager. Nothing else was touched, so the old CRM is exactly as before.

## Known limits of this first version

- View only. No saving, no audit entry on open.
- Matches and email drafts are not loaded yet.
- Saved Features and Look settings are not stored on the server yet.
- Table and column names were taken from the schema files, not from the live database. If a section is empty, that is why; send me the `?state=1` counts and I will fix the query.
