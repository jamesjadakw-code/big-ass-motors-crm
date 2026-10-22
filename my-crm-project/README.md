# BAM CRM

Machinery CRM and sourcing engine for Big Ass Motors: leads, inventory, lead-to-inventory matching,
buyer-safe pitches, PDF feature sheets, and listing ingestion.

## Run

```
npm run install:all
npm run dev        # http://localhost:5173 (API on :4000)
npm start          # one server at http://localhost:4000
```

Data lives in `server/data/db.json` (created with fictional sample data on first run; delete it to reset).
Edit `server/config.json` for company name, phone, agent name and the PDF closing text.

## What's in it

- **Today**: overdue and due-today tasks, never-called leads, hot (85+) matches, "today's play".
- **Match Inbox**: every unit with its top buyers, score rings, reason chips, a buyer-safe pitch draft (English or Spanish), and Text / Email / Log call / Send brochure actions.
- **Leads / Board**: dedupe on `LOWER(TRIM(email))` (phone if no email), CSV bulk import, drag-and-drop Kanban.
- **Call log**: a note schedules the next weekday 10:00 AM follow-up, detects Spanish, and drafts the follow-up.
- **Inventory**: full machine schema, internal ask / buy / public list price (blank list price prints "Call for Price"), margin, "Pending Inspection" flags.
- **Add from listing**: all parsing is internal (no external AI). Three ways in: the **BAM Grabber** bookmarklet (run it on the listing in your own logged-in browser; it opens the CRM with the page parsed, photos captured), **Pull URL** (server fetch for sites that allow it), or pasted text. Year/make/model/serial/hours/price/location/defects are extracted, never guessed.
- **Bulk Pitch**: tick several buyers in Match Inbox and create Gmail drafts from sales@bigassmotors.com, each with a personalized feature sheet attached (nothing is sent). One-time Google setup: see `GOOGLE-SETUP.md`.
- **PDF feature sheet**: `/api/inventory/:id/brochure.pdf`. It never includes internal pricing.

## Known limits

- The listing parser is rule-based, not LLM or OCR. Facebook blocks server-side fetching, so use the bookmarklet there. The bookmarklet bakes in the CRM address you drag it from (e.g. `http://localhost:4000`), so re-drag it if that changes.
- OEM enrichment uses a tiny approximate seed table in `server/parser.js`. Put verified values in `server/oem-specs.json` (`[{ "match": "rtx1250", "engine": "...", "hp": 130, "weight": "...", "dimensions": "..." }]`).
- Google Sheets sync, Cloudflare workers and MySQL from the spec are not built; storage is a local JSON file.

## Tests
```
cd server
BAM_DB=%TEMP%\bam-test.json PORT=4100 node index.js     # throwaway data file, real data untouched
node api-test.js http://127.0.0.1:4100                    # 67 checks; restores config.json itself
```
The API listens on `127.0.0.1` only (no login). Set `HOST=0.0.0.0` to share it on a network you trust.

Bulk Pitch tests (no real Google account; uses a built-in mock): `cd server && node google-test.js` (53 checks).
To try the feature by hand without Google: `node google-mock.js`, then start the server with `GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y GOOGLE_AUTH_URL=http://localhost:4200/auth GOOGLE_TOKEN_URL=http://localhost:4200/token GOOGLE_API_BASE=http://localhost:4200`.
