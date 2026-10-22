# BAM CRM Verification Checklist

Screens not yet browser-tested: Leads, Matches, Haul, Settings.
Start: `npm run dev` then open http://localhost:5173 (API :4000). Reset data by deleting `server/data/db.json`.
Mark each item `[x]` pass or `[!]` bug (write the bug under "Bugs found" at the bottom).

> Code check: the nav only has Today, Match Inbox, Leads, Board, Inventory, Add From Listing, Dashboard.
> There is **no Haul route and no Settings route** in `client/src/App.jsx`.
> Haul is currently just the "est. haul miles" shown on Match Inbox cards (`server/geo.js`).
> Settings is only `server/config.json` plus `GET /api/config`.
> Decide whether those become real screens (see section 3 and 4).

## 1. Leads (`#/leads`)
- [x] Page loads with seeded leads, no console errors, no failed network calls
- [x] Search / filter / sort work and the count updates
- [x] Add lead: required fields enforced, lead appears without reload
- [x] Dedupe: same email (different case/spaces) is rejected or merged; phone-only dedupe when no email
- [x] Edit lead (PUT), changes persist after refresh
- [x] Delete lead (DELETE) asks to confirm, and its tasks and matches disappear
- [x] CSV import: valid file, a file with duplicates, a file with bad or missing columns, an empty file
- [x] Lead detail opens: interactions timeline shows
- [x] Log call: note saves, next follow-up is the next weekday 10:00 AM, Spanish notes are detected and get a Spanish draft
- [x] Lead "matches" tab shows units with scores and reasons
- [x] Stage change here is reflected on the Board
- [x] Layout is OK at narrow width and no text overflows

## 2. Matches (`#/match`, Match Inbox)
- [x] Every available unit appears with its top buyers; units with no matches show an empty state
- [x] Score ring and reason chips are plausible against `server/matching.js`
- [x] Pitch draft is buyer-safe: **no ask, buy price or margin appears anywhere**
- [x] English / Spanish toggle swaps the draft
- [x] Text and Email actions open `sms:` / `mailto:` with the draft; Copy works
- [x] Log call from a match writes an interaction and schedules the follow-up
- [x] Send brochure opens `/api/inventory/:id/brochure.pdf`; the PDF has no internal pricing and blank list price shows "Call for Price"
- [x] Match status buttons (`POST /api/matches/status`) persist after refresh
- [x] Hot (85+) matches also show on Today

## 3. Haul — REMOVED by user
Haul miles no longer appear on Match cards, lead match lists, pitch drafts or PDFs (`server/geo.js` deleted). Nothing to test.

## 4. Settings (`#/settings`, new admin screen)
- [x] Decision: build the admin screen (done)
- [x] `GET /api/config` returns company name, phone, agent name, PDF closing text
- [x] Changes to config appear in the PDF feature sheet and in pitch drafts (restart server if it is read once at startup)
- [x] Missing or invalid config falls back safely
- [x] If building a screen: edit and save, validation, and no secrets are exposed to the client

## Cross-cutting
- [x] `npm start` (single server on :4000) serves the same screens as dev
- [x] Browser console is clean on all four screens
- [x] Reload on each `#/route` deep link works
- [x] After a server restart, `db.json` data is intact

## Bugs found
| # | Screen | Steps | Expected | Actual | Status |
|---|--------|-------|----------|--------|--------|
| 1 | Leads | View at ~950px wide | All columns visible | Stage column clipped by overflow-hidden | Fixed (table scrolls, nowrap cells, narrower sidebar) |
| 2 | Matches | Read pitch panel | English/Spanish toggle | No toggle existed (language fixed by lead) | Fixed (pills added, server returns both drafts) |
| 3 | Matches | Click Email | Opens compose | mailto: has no handler (Gmail web user) | Fixed (opens Gmail compose, still logs touch) |
| 4 | Matches | Open brochure PDF | BAM brochure style, no internal data | Generic sheet; showed Seller status "Motivated" | Fixed (Juan-style via reportlab, seller status removed) |
| 5 | Today | Follow-up task | Says what it is for, links to lead | Title only, no link, tomorrow's tasks hidden | Fixed (note + link, Upcoming list) |
| 6 | Matches | Budget score vs list price | Scored on public price | Scored on internal ask | Fixed (list price first) |
| 7 | Matches | Category match | Exact machine type | "Vacuum Excavator" matched "Excavator"; wrong type could pass on budget | Fixed (exact type, wrong type capped at 39) |
| 8 | Settings | Save, then fetch a brochure | Next request works | `node --watch` restarted the server on every config.json write, so requests right after Save failed | Fixed (config loaded via `server/config.js` with fs; saves cause 0 restarts) |
| 9 | Brochure | Change company name in Settings | Header and footer follow it | Header/footer text was fixed | Fixed (uses company name, minus LLC) |
| 10 | All (phone) | Open any page at 375px wide | Content usable | The 176px sidebar left ~200px for content; titles clipped, forms squeezed | Fixed: top bar with scrolling tabs under 768px; Match Inbox stacks; forms collapse to 1-2 columns |
| 11 | API | Unknown `/api/...` URL, or malformed JSON body | JSON error | Express HTML error page + stack trace in the console | Fixed: JSON 404 and a JSON error handler (400 for bad JSON) |
| 12 | Data | `db.json` unreadable or corrupt, then start the server | Refuse to start, keep the file | Silently replaced with sample data (data loss) | Fixed: server stops with a message and saves a `.corrupt-<time>` copy |
| 13 | Security | Open the API from another device on the network | Not reachable without a login | Server listened on all interfaces with no login | Fixed: binds to 127.0.0.1; set `HOST=0.0.0.0` to share deliberately |
| 14 | Add From Listing | "Pull URL" with a redirect, `localtest.me`, `[::1]` or a decimal IP | Blocked | Only literal `localhost`/`127.`/`10.` names were blocked; redirects were followed unchecked | Fixed: every hop is DNS-resolved and must be a public address; response size capped at 2 MB |
| 15 | Today / Inventory | Phone width | No element wider than the screen | Task header and Inventory buttons overflowed | Fixed (wrap) |
| 16 | Settings | Config write | Safe | Written non-atomically | Fixed: write-then-rename |
| 17 | Brochure | Generate a sheet for a unit with a serial | Serial hidden from buyers (BAM form says "hidden publicly") | Serial / VIN was printed | Fixed: removed from both renderers (reportlab and pdfkit fallback); serial stays in the CRM |
| 18 | Add From Listing | Ingest text like "serial number available upon inspection" (seen in real data: BAM-1007) | Serial left blank, flagged Pending Inspection | Serial saved as "INSPECTION" | Fixed: a serial must contain a digit. **BAM-1007 still holds the bad value; clear it by hand** |
| 19 | Security | A website open in your browser calls `http://localhost:4000/api/...` | Blocked | CORS allowed every origin, so any site could read or change your CRM, and (with Bulk Pitch) create drafts | Fixed: only localhost origins allowed; requests with a foreign Host header refused (DNS rebinding) |

### Open questions (not changed, your call)
- Login: the live site (bigassmotorscrm.bigassmotors.com, `inventory/login.php`, e-mail/password + Google access list) keeps its existing login; it is not changed. This local build has no login and listens on this computer only, so it must not be deployed to a shared host as-is.
- `start.bat` / dev mode needs the Vite proxy (now pinned to 127.0.0.1).
- Bulk Pitch is tested against a mock Google only. Still to confirm with the real sales@ account: the consent flow, that the
  draft links open the right compose window, and how many pop-ups your browser allows per click.
