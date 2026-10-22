// Generated from unified-crm-board.html: one feature catalog for the board and the Settings switchboard.
window.AREAS = [
  ['home', 'Daily work'], ['leads', 'Leads & pipeline'], ['inv', 'Inventory'], ['source', 'Sourcing & intake'],
  ['match', 'Matching'], ['out', 'Outreach & docs'], ['team', 'Team & admin'], ['look', 'Look & layout'],
];
// side: live | local · pair: same job as another item · rec: Claude's suggestion · risk: needs care
window.ITEMS = [
  // ---- LIVE: daily work
  { id: 'L-today', side: 'live', area: 'home', pair: 'today', rec: 1, name: 'Today view (Lead Desk)', desc: 'Overdue, due today, never called, hot with phone, done today; Today\'s play, motivation and sales-coach cards.', src: 'Lead Desk SPA' },
  { id: 'L-follow', side: 'live', area: 'home', rec: 1, name: 'Follow-ups with alerts (New York time)', desc: 'Overdue follow-up list with browser alerts while the tab is open.', src: 'Lead Desk' },
  { id: 'L-brain', side: 'live', area: 'home', name: 'War Room + One Brain (⌘J)', desc: 'War Room ranks leads against existing units with mostly made-up scores; One Brain sends buyer names, locations and wants to xAI / Google.', src: 'api/brain.php', risk: 'Breaks your rule: existing units + outside AI' },
  { id: 'L-search', side: 'live', area: 'home', rec: 1, name: 'Global search (⌘K)', desc: 'Search machines, buyers and cities from any screen.', src: 'Lead Desk' },
  { id: 'L-es', side: 'live', area: 'home', rec: 1, name: 'Spanish interface (ES)', desc: 'One-click Spanish UI for the whole CRM.', src: 'Lead Desk' },
  { id: 'L-notif', side: 'live', area: 'home', rec: 1, name: 'Notification bell', desc: 'Unread alerts count in the top bar.', src: 'Lead Desk' },
  { id: 'L-dash', side: 'live', area: 'home', pair: 'dash', rec: 1, name: 'Inventory dashboard + 7-day engagement', desc: 'Total, live, draft, pending, sold, archived, live list value, seller submissions; views, clicks, brochures, info and quote requests.', src: 'index.php' },
  { id: 'L-ticker', side: 'live', area: 'home', rec: 1, name: 'Live engagement ticker', desc: 'Who viewed or clicked which unit, refreshed every 15 s.', src: 'ticker.php' },
  { id: 'L-hot', side: 'live', area: 'home', rec: 1, name: 'Hot units · 14 days', desc: 'Heat score per unit from views, brochures, info and quote requests.', src: 'unit_heat()' },
  { id: 'L-weekly', side: 'live', area: 'home', rec: 1, name: 'Weekly list', desc: 'This week\'s units in one sheet.', src: 'weekly.php' },
  // ---- LIVE: leads
  { id: 'L-leads', side: 'live', area: 'leads', pair: 'leads', rec: 1, name: 'Leads list (2,375 real leads)', desc: 'Server-side search and filters; Sales users only see leads assigned to them.', src: 'leads.php' },
  { id: 'L-tasks', side: 'live', area: 'leads', pair: 'tasks', rec: 1, name: 'Team tasks + reminders', desc: 'Give a task to any teammate with due date, time and priority, linked to a lead.', src: 'tasks.php · tw_tasks' },
  { id: 'L-board', side: 'live', area: 'leads', pair: 'board', rec: 1, name: 'Kanban board + List view', desc: 'Lead Desk board and list views of the pipeline.', src: 'Lead Desk' },
  { id: 'L-call', side: 'live', area: 'leads', pair: 'call', rec: 1, name: 'Call log + next-step suggestions', desc: 'Call box on every lead card with suggested next steps.', src: 'calllog.js' },
  { id: 'L-assign', side: 'live', area: 'leads', rec: 1, name: 'Lead assignment + team settings', desc: 'Who may assign leads; bulk assignment; owner-scoped access.', src: 'tw_assign · team_settings.php' },
  { id: 'L-inq', side: 'live', area: 'leads', rec: 1, name: 'Website inquiries + e-mail alerts', desc: 'Inquiries from the public site land in the CRM with alerts.', src: 'inquiries.php' },
  { id: 'L-fin', side: 'live', area: 'leads', rec: 1, name: 'Finance requests', desc: 'Buyer finance applications in one list.', src: 'finance.php' },
  { id: 'L-sellers', side: 'live', area: 'leads', rec: 1, name: 'Sellers + Exclusive Sellers portal', desc: 'Seller records and a Google-sign-in portal for exclusive sellers.', src: 'sellers.php' },
  // ---- LIVE: inventory
  { id: 'L-inv', side: 'live', area: 'inv', pair: 'inv', rec: 1, name: 'Inventory list with URL-listings tab', desc: 'Live, draft, staged, sold and archived units; URL listings first.', src: 'inventory.php' },
  { id: 'L-unit', side: 'live', area: 'inv', pair: 'unit', rec: 1, name: 'Full unit editor', desc: 'Condition, undercarriage %, tires %, attachments, public vs internal fields, auto stock #.', src: 'unit.php (714 lines)' },
  { id: 'L-ai', side: 'live', area: 'inv', rec: 1, name: 'AI specs + "parse specs from description"', desc: 'Draft specs, highlights and a buyer-safe description for review; batch mode from the list.', src: 'ai_specs.php · xAI / Gemini' },
  { id: 'L-spec', side: 'live', area: 'inv', rec: 1, name: 'Verify-only OEM spec fill', desc: 'Fills missing manufacturer specs only after you verify them.', src: 'spec_fill.php' },
  { id: 'L-tpl', side: 'live', area: 'inv', rec: 1, name: 'Field templates per machine type', desc: 'Different spec fields for drills, trenchers, excavators…', src: 'field_templates.php' },
  { id: 'L-verify', side: 'live', area: 'inv', rec: 1, name: 'Verify gate + List Now / Sold / Archive', desc: 'A unit goes Live only after verification.', src: 'api/hub/verify.php' },
  { id: 'L-import', side: 'live', area: 'inv', rec: 1, name: 'Bulk import, template, CSV export', desc: 'Spreadsheet in and out for inventory.', src: 'import.php · export.php' },
  { id: 'L-legacy', side: 'live', area: 'inv', name: 'Old-site import (Machinio CSV)', desc: 'One-time import from the previous website.', src: 'legacy.php' },
  // ---- LIVE: sourcing
  { id: 'L-addurl', side: 'live', area: 'source', pair: 'ingest', rec: 1, name: 'Add from URL + BAM Grabber', desc: 'Bookmarklet, Pull, Import with photos; always lands as a hidden Draft.', src: 'add_url.php' },
  { id: 'L-sourcing', side: 'live', area: 'source', rec: 1, name: 'Sourcing module (internal)', desc: 'Track machines to buy, with results feeding the match workbench.', src: 'sourcing.php' },
  { id: 'L-sync', side: 'live', area: 'source', rec: 1, name: 'Auto-sync sources', desc: 'Scheduled pulls from configured listing sources.', src: 'sync.php' },
  { id: 'L-hub', side: 'live', area: 'source', rec: 1, name: 'Inventory Hub queue', desc: 'Step-by-step queue that moves grabbed units to verified.', src: 'hub.php · api/hub' },
  // ---- LIVE: matching
  { id: 'L-engine', side: 'live', area: 'match', pair: 'engine', rec: 1, name: 'Matching engine (score + reasons)', desc: 'Scores leads per unit and saves matches. Already limited to scraped machines (url_listing + verified).', src: 'inc/matching.php · unit_lead_matches', note: 'Fits your rule' },
  { id: 'L-wb', side: 'live', area: 'match', rec: 1, name: 'Matches & Scraped Units workbench', desc: 'Tabs for new, follow-up, staged and sourcing; minimum-score filter.', src: 'matches.php', risk: 'Drop the Live-inventory tab + filter bypass' },
  { id: 'L-finder', side: 'live', area: 'match', rec: 1, name: 'Buyer Finder per unit', desc: 'Every lead that fits one unit, ranked.', src: 'buyer_finder.php' },
  { id: 'L-ws', side: 'live', area: 'match', pair: 'inbox', name: 'Workspace Match Inbox', desc: 'Top-3 buyers, keys 1/2/3, action bar T/E/C/Q/L/S, brand chips, dealer & service map, haul miles.', src: 'inventory/workspace' },
  { id: 'N-desk', side: 'live', area: 'match', rec: 1, name: 'Third-Party Machines desk (new)', desc: 'Inventory → URL LISTINGS becomes one pipeline: Scraped → Matched at scrape (internal) → BAM-branded (verified, seller stripped, BAM brochure) → Pitched. Pitching stays locked until branded. Only scraped machines are ever matched.', src: 'url_listings.php + inc/matching.php', note: 'Your rule, confirmed' },
  { id: 'L-auto', side: 'live', area: 'match', rec: 1, name: 'Automations (drafts only, never auto-sent)', desc: 'Matching leads get a drafted e-mail to review. Retarget from new Live units to newly BAM-branded scraped machines.', src: 'automations.php' },
  // ---- LIVE: outreach
  { id: 'L-broch', side: 'live', area: 'out', pair: 'pdf', rec: 1, name: 'Official 2-page BAM brochure PDF', desc: 'US-flag logo, BAM letterhead, multi-unit packets and list sheets.', src: 'brochure_pdf.php' },
  { id: 'L-outbox', side: 'live', area: 'out', pair: 'drafts', rec: 1, name: 'Draft e-mails outbox', desc: 'Review, edit and send drafted e-mails.', src: 'outbox.php' },
  { id: 'L-inbox', side: 'live', area: 'out', rec: 1, name: 'Messages inbox', desc: 'Incoming messages in the CRM.', src: 'inbox.php' },
  { id: 'L-invoice', side: 'live', area: 'out', rec: 1, name: 'Invoice generator', desc: 'Invoice from a unit\'s stock number.', src: 'invoice.php' },
  { id: 'L-gmail', side: 'live', area: 'out', rec: 1, name: 'Gmail link (Google OAuth)', desc: 'Connect the sales mailbox.', src: 'google-gmail.php' },
  // ---- LIVE: team
  { id: 'L-users', side: 'live', area: 'team', pair: 'users', rec: 1, name: 'Users & roles (server-enforced)', desc: 'Admin, Sales, Broker; menus and APIs both check the role.', src: 'users.php · inc/roles.php' },
  { id: 'L-audit', side: 'live', area: 'team', rec: 1, name: 'Audit log + Activity feed', desc: 'Every change, plus log-ins and session length per user.', src: 'audit.php · activity.php' },
  { id: 'L-gsign', side: 'live', area: 'team', rec: 1, name: 'Google sign-in allow-list + Turnstile', desc: 'Only listed Google accounts get in; bot check on forms.', src: 'google_callback.php' },
  { id: 'L-settings', side: 'live', area: 'team', pair: 'settings', rec: 1, name: 'Settings (site, pricing, stock #, AI keys)', desc: 'Website, featured units, signature, pricing rules, AI keys, automations.', src: 'settings.php (459 lines)' },
  { id: 'L-site', side: 'live', area: 'team', rec: 1, name: 'Public website + match form', desc: 'bigassmotors.com units and the buyer match form feed the CRM.', src: 'match-form · public pages' },
  { id: 'L-pwa', side: 'live', area: 'team', rec: 1, name: 'Installable app (phone home screen)', desc: 'PWA icons and manifest.', src: 'manifest.webmanifest' },
  // ---- LIVE: looks
  { id: 'L-v01', side: 'live', area: 'look', pair: 'shell', rec: 1, name: 'Shell: Lead Desk (v01 Command, black + yellow)', desc: 'The dark yellow "Work the book" layout with the left menu.', src: 'Lead Desk' },
  { id: 'L-v03', side: 'live', area: 'look', pair: 'theme', name: 'Theme: v03 Jobsite', desc: 'The alternate per-user look.', src: 'ui_theme.php' },
  { id: 'L-v02', side: 'live', area: 'look', pair: 'theme', name: 'Theme: v02 Clean SaaS (white + indigo)', desc: 'Light Linear/Notion look now on the Workspace.', src: 'bam-command-center.css' },
  { id: 'L-mode', side: 'live', area: 'look', rec: 1, name: 'Per-user dark / white mode', desc: 'Each person picks their own look.', src: 'users.ui_mode' },
  { id: 'L-fonts', side: 'live', area: 'look', name: 'Fonts: Barlow Condensed, Black Ops One, Plex Mono', desc: 'Self-hosted, so no Google Fonts call.', src: 'assets/fonts' },
  { id: 'L-sound', side: 'live', area: 'look', name: 'Dialer sounds', desc: '"Pick up the phone and start dialing" and kick sounds.', src: 'assets/*.mp3' },

  // ---- LOCAL: daily work
  { id: 'C-today', side: 'local', area: 'home', pair: 'today', name: 'Today (Cockpit)', desc: 'Tiles, today\'s play, hot buyers 85+, never called, quick add task.', src: 'Today.jsx' },
  { id: 'C-dash', side: 'local', area: 'home', pair: 'dash', name: 'Dashboard: pipeline + potential margin', desc: 'Pipeline by stage, potential margin and units pending inspection.', src: 'Dashboard.jsx' },
  // ---- LOCAL: leads
  { id: 'C-leads', side: 'local', area: 'leads', pair: 'leads', name: 'Leads with best-match score column', desc: 'Each lead shows its best unit and score; machinery criteria on the form.', src: 'Leads.jsx' },
  { id: 'C-dedupe', side: 'local', area: 'leads', rec: 1, name: 'Strict e-mail dedupe + merge on import', desc: 'LOWER(TRIM(email)) key; a duplicate updates the existing lead and its history.', src: 'server/index.js', risk: 'Check live import first' },
  { id: 'C-board', side: 'local', area: 'leads', pair: 'board', name: 'Drag-and-drop board with budget totals', desc: 'Stage columns show total buyer budget.', src: 'Board.jsx' },
  { id: 'C-call', side: 'local', area: 'leads', rec: 1, name: '5-second call note → auto follow-up', desc: 'Schedules next weekday 10 AM, detects Spanish, drafts the follow-up text.', src: 'LeadParts.jsx · pitch.js', note: 'Add into the live call log' },
  { id: 'C-cold', side: 'local', area: 'leads', rec: 1, name: 'Cold-lead nurture (7 days)', desc: 'Daily cron gives every lead untouched for 7 days a nurture task.', src: 'Hunter checkColdLeads()', risk: 'Write to tw_tasks, not a new table' },
  { id: 'C-tasks', side: 'local', area: 'leads', pair: 'tasks', name: 'Hunter task table (MATCH_ALERT, NURTURE…)', desc: 'Separate `tasks` table with priorities 1–3.', src: 'TaskOrchestrator', risk: 'Not shown in CRM task screens' },
  // ---- LOCAL: inventory
  { id: 'C-unit', side: 'local', area: 'inv', pair: 'unit', name: 'Unit form with internal pricing box', desc: 'Seller ask, buy price and public price in a red "never shown to buyers" box.', src: 'UnitForm.jsx' },
  { id: 'C-margin', side: 'local', area: 'inv', rec: 1, name: 'Margin per unit', desc: '(list or ask) − buy price on every card.', src: 'Inventory.jsx' },
  { id: 'C-pending', side: 'local', area: 'inv', rec: 1, name: '"Pending Inspection" flags', desc: 'Missing specs are flagged on the unit and the brochure, never guessed.', src: 'parser.js · pdf.js' },
  { id: 'C-inv', side: 'local', area: 'inv', pair: 'inv', name: 'Inventory cards with buyer count', desc: 'Card grid showing top score and number of buyers per unit.', src: 'Inventory.jsx' },
  // ---- LOCAL: sourcing
  { id: 'C-ingest', side: 'local', area: 'source', pair: 'ingest', name: 'Add From Listing (grabber, Pull, paste)', desc: 'Strips feed junk, extracts specs, shows matched buyers on arrival.', src: 'Ingest.jsx · parser.js' },
  { id: 'C-buyers-arrival', side: 'local', area: 'source', rec: 1, name: 'Matched buyers on arrival', desc: 'Before saving a grabbed listing, see which buyers it fits.', src: 'POST /api/ingest/parse' },
  { id: 'C-specparser', side: 'local', area: 'source', name: 'Hunter SpecParser (title-only ai_specs)', desc: 'Builds ai_specs from the title; OEM horsepower only fills blanks.', src: 'SpecParser.php' },
  // ---- LOCAL: matching
  { id: 'C-engine', side: 'local', area: 'match', pair: 'engine', name: 'Hunter MatchingEngine', desc: 'Over 80% → urgent alert; only Live + verified units match.', src: 'MatchingEngine.php', risk: 'Second engine' },
  { id: 'C-inbox', side: 'local', area: 'match', pair: 'inbox', rec: 1, name: 'Cockpit Match Inbox', desc: 'Score rings, reason chips, top buyers, buyer-safe pitch in English or Spanish, one-click actions.', src: 'MatchInbox.jsx' },
  { id: 'C-strict80', side: 'local', area: 'match', rec: 1, name: 'Urgent alert rule (> 80%)', desc: 'A strong match creates a priority-1 task once, never twice.', src: 'MatchingEngine rule', note: 'Add to live engine' },
  // ---- LOCAL: outreach
  { id: 'C-bulk', side: 'local', area: 'out', rec: 1, name: 'Bulk Pitch → Gmail drafts with sheet attached', desc: 'Tick several buyers, get one personalized draft each with the feature sheet attached. Nothing is sent.', src: 'google.js', note: 'Rebuild in PHP' },
  { id: 'C-pitch', side: 'local', area: 'out', rec: 1, name: 'Buyer-safe pitch (EN / ES)', desc: 'Never includes ask, buy price, margin or seller details.', src: 'pitch.js' },
  { id: 'C-pdf', side: 'local', area: 'out', pair: 'pdf', name: 'Feature sheet PDF (Python reportlab)', desc: 'One-page sheet; blank list price prints "Call for Price".', src: 'brochure.py', risk: 'Python can\'t run on Hostinger' },
  // ---- LOCAL: team
  { id: 'C-users', side: 'local', area: 'team', pair: 'users', name: 'Users, Team & Audit screen', desc: 'Cockpit screen for users, roles and the audit trail.', src: 'TeamUsers.jsx' },
  { id: 'C-settings', side: 'local', area: 'team', pair: 'settings', name: 'Settings with live preview', desc: 'Change the brand gold and density and see it before saving.', src: 'Settings.jsx' },
  // ---- LOCAL: looks
  { id: 'C-shell', side: 'local', area: 'look', pair: 'shell', name: 'Shell: Cockpit sidebar', desc: 'Left menu with BAM wordmark, user card and sign-out.', src: 'App.jsx' },
  { id: 'C-neon', side: 'local', area: 'look', pair: 'theme', rec: 1, name: 'Theme: neon glow, bordered buttons', desc: 'Glowing outlined buttons, glass panels, grid background.', src: 'index.css' },
  { id: 'C-tabfonts', side: 'local', area: 'look', rec: 1, name: 'A different font per tab', desc: 'Orbitron, Audiowide, Rajdhani, Chakra Petch, Exo 2, Michroma.', src: 'App.jsx NAV' },
  { id: 'C-gold', side: 'local', area: 'look', rec: 1, name: 'One brand-gold color from Settings', desc: 'Change one color and the whole CRM follows.', src: 'theme.js' },
  { id: 'C-density', side: 'local', area: 'look', rec: 1, name: 'Compact / standard density', desc: 'Fit more rows on screen for heavy users.', src: 'density-*' },
  { id: 'C-mobile', side: 'local', area: 'look', rec: 1, name: 'Mobile top-bar menu', desc: 'Menu turns into a scrolling bar on phones.', src: 'App.jsx' },
];
