// Feature switchboard: one catalog for Settings → Features and for every screen that checks a switch.
// built: true  → a real switch in this CRM (every place listed in `where` checks it).
// built: false → shown so the board covers both CRMs, but it can't be switched on until it is built here.
// lock         → can never be switched on (breaks a business rule).
// side         → which CRM the feature comes from (the board lane it starts in).

export const AREAS = [
  ['screens', 'Screens'], ['home', 'Daily work'], ['leads', 'Leads & pipeline'], ['inv', 'Inventory'],
  ['source', 'Sourcing & intake'], ['match', 'Matching & outreach'], ['team', 'Team & admin'],
];

export const FEATURES = [
  // ---- screens (menu items) ----
  { id: 'scr-today', area: 'screens', side: 'local', built: true, name: 'Today screen', desc: 'Overdue and due tasks, never called, hot buyers, today’s play.', where: 'Menu · Today' },
  { id: 'scr-match', area: 'screens', side: 'local', built: true, name: 'Match Inbox screen', desc: 'Units with their top buyers, score rings and buyer-safe pitches.', where: 'Menu · Match Inbox' },
  { id: 'scr-leads', area: 'screens', side: 'local', built: true, name: 'Leads screen', desc: 'Buyer list with search, stages and lead detail.', where: 'Menu · Leads' },
  { id: 'scr-board', area: 'screens', side: 'local', built: true, name: 'Board screen', desc: 'Drag-and-drop pipeline by stage with budget totals.', where: 'Menu · Board' },
  { id: 'scr-inventory', area: 'screens', side: 'local', built: true, name: 'Inventory screen', desc: 'Unit cards with buyer counts, margin and brochure.', where: 'Menu · Inventory' },
  { id: 'scr-ingest', area: 'screens', side: 'local', built: true, name: 'Add From Listing screen', desc: 'Grab, pull or paste a third-party listing.', where: 'Menu · Add From Listing' },
  { id: 'scr-dashboard', area: 'screens', side: 'local', built: true, name: 'Dashboard screen', desc: 'Pipeline by stage, live list value and potential margin.', where: 'Menu · Dashboard' },
  { id: 'scr-users', area: 'screens', side: 'local', built: true, name: 'Users & Audit screen', desc: 'Users, roles and the audit trail.', where: 'Menu · Users & Audit' },

  // ---- daily work ----
  { id: 'today-play', area: 'home', side: 'live', built: true, name: 'Today’s play card', desc: 'One line telling the rep what to work first.', where: 'Today' },
  { id: 'today-quicktask', area: 'home', side: 'local', built: true, name: 'Quick task', desc: 'Add a task due 5 PM today in one line.', where: 'Today · My tasks' },
  { id: 'today-hot', area: 'home', side: 'local', built: true, name: 'Hot buyers panel', desc: 'Buyers with an 85+ match, one click to the match.', where: 'Today' },
  { id: 'today-never', area: 'home', side: 'live', built: true, name: 'Never called panel', desc: 'Leads nobody has called yet.', where: 'Today' },
  { id: 'dash-pipeline', area: 'home', side: 'local', built: true, name: 'Pipeline by stage', desc: 'Bar chart of leads per stage.', where: 'Dashboard' },
  { id: 'dash-margin', area: 'home', side: 'local', built: true, name: 'Potential margin', desc: 'Sum of list/ask minus buy price across units.', where: 'Dashboard' },
  { id: 'L-ticker', area: 'home', side: 'live', built: false, name: 'Live engagement ticker', desc: 'Who viewed or clicked which unit, every 15 s.' },
  { id: 'L-hot', area: 'home', side: 'live', built: false, name: 'Hot units · 14 days', desc: 'Heat score from views, brochures and quote requests.' },
  { id: 'L-weekly', area: 'home', side: 'live', built: false, name: 'Weekly list', desc: 'This week’s units in one sheet.' },
  { id: 'L-brain', area: 'home', side: 'live', built: false, lock: 'Breaks your rules: matches existing units + sends buyer data to outside AI', name: 'War Room + One Brain', desc: 'Velocity queue and AI assistant.' },

  // ---- leads ----
  { id: 'leads-import', area: 'leads', side: 'local', built: true, name: 'Bulk import (CSV) with dedupe', desc: 'Same e-mail merges into the existing lead.', where: 'Leads · Bulk import' },
  { id: 'leads-calllog', area: 'leads', side: 'local', built: true, name: '5-second call note → auto follow-up', desc: 'Next weekday 10 AM task, Spanish detection, drafted follow-up.', where: 'Lead detail · Log a call' },
  { id: 'L-assign', area: 'leads', side: 'live', built: false, name: 'Lead assignment + team settings', desc: 'Bulk assignment, owner-scoped access.' },
  { id: 'L-inq', area: 'leads', side: 'live', built: false, name: 'Website inquiries + alerts', desc: 'Inquiries from the public site.' },
  { id: 'L-fin', area: 'leads', side: 'live', built: false, name: 'Finance requests', desc: 'Buyer finance applications.' },
  { id: 'L-sellers', area: 'leads', side: 'live', built: false, name: 'Sellers + Exclusive Sellers portal', desc: 'Seller records and portal.' },

  // ---- inventory ----
  { id: 'inv-margin', area: 'inv', side: 'local', built: true, name: 'Margin per unit', desc: 'Shown on every inventory card.', where: 'Inventory cards' },
  { id: 'inv-brochure', area: 'inv', side: 'live', built: true, name: '2-page BAM brochure', desc: 'Buyer-safe brochure from a unit.', where: 'Inventory · Match Inbox' },
  { id: 'L-ai', area: 'inv', side: 'live', built: false, lock: 'Sends listing data to outside AI (off by your rule)', name: 'AI specs (xAI / Gemini)', desc: 'AI-drafted specs and description.' },
  { id: 'L-spec', area: 'inv', side: 'live', built: false, name: 'Verify-only OEM spec fill', desc: 'Fills missing OEM specs after verification.' },
  { id: 'L-tpl', area: 'inv', side: 'live', built: false, name: 'Field templates per machine type', desc: 'Different spec fields per type.' },
  { id: 'L-verify', area: 'inv', side: 'live', built: false, name: 'Verify gate + List Now / Sold / Archive', desc: 'A unit goes Live only after verification.' },

  // ---- sourcing ----
  { id: 'ingest-grabber', area: 'source', side: 'live', built: true, name: 'BAM Grabber bookmarklet', desc: 'Grab a listing from your own logged-in browser.', where: 'Add From Listing' },
  { id: 'ingest-pull', area: 'source', side: 'live', built: true, name: 'Pull URL', desc: 'Read a listing from its link where the site allows it.', where: 'Add From Listing' },
  { id: 'ingest-paste', area: 'source', side: 'live', built: true, name: 'Paste listing text', desc: 'Paste the text and extract specs.', where: 'Add From Listing' },
  { id: 'ingest-buyers', area: 'source', side: 'local', built: true, name: 'Matched buyers on arrival', desc: 'See who fits a listing before saving it.', where: 'Add From Listing · Review' },
  { id: 'ingest-photostore', area: 'source', side: 'local', built: true, name: 'Keep our own photo copies', desc: 'Saves listing photos so expiring links can’t break a brochure.', where: 'On save (engine)' },
  { id: 'L-sourcing', area: 'source', side: 'live', built: false, name: 'Sourcing module', desc: 'Track machines to buy.' },
  { id: 'L-sync', area: 'source', side: 'live', built: false, name: 'Auto-sync sources', desc: 'Scheduled pulls from listing sources.' },
  { id: 'N-desk', area: 'source', side: 'live', built: false, name: '3rd-Party Machines desk', desc: 'Scraped → Matched → BAM-branded → Pitched.' },

  // ---- matching & outreach ----
  { id: 'match-text', area: 'match', side: 'local', built: true, name: 'Text pitch', desc: 'Opens a text with the buyer-safe pitch.', where: 'Match Inbox' },
  { id: 'match-email', area: 'match', side: 'local', built: true, name: 'E-mail pitch', desc: 'Opens an e-mail with the pitch.', where: 'Match Inbox' },
  { id: 'match-spanish', area: 'match', side: 'local', built: true, name: 'English / Spanish pitch toggle', desc: 'Switch the draft language per buyer.', where: 'Match Inbox' },
  { id: 'match-logcall', area: 'match', side: 'local', built: true, name: 'Log call from a match', desc: 'Writes the call and schedules the follow-up.', where: 'Match Inbox' },
  { id: 'match-bulk', area: 'match', side: 'local', built: true, name: 'Bulk pitch → Gmail drafts', desc: 'One personalized draft per ticked buyer, nothing sent.', where: 'Match Inbox' },
  { id: 'match-dismiss', area: 'match', side: 'local', built: true, name: 'Dismiss a match', desc: 'Hide a buyer for this unit.', where: 'Match Inbox' },
  { id: 'L-auto', area: 'match', side: 'live', built: false, name: 'Automations (drafts only)', desc: 'Drafted e-mails for new scraped machines.' },
  { id: 'L-outbox', area: 'match', side: 'live', built: false, name: 'Draft e-mails outbox', desc: 'Review and send drafted e-mails.' },
  { id: 'L-invoice', area: 'match', side: 'live', built: false, name: 'Invoice generator', desc: 'Invoice from a unit.' },
  { id: 'C-engine', area: 'match', side: 'local', built: false, lock: 'Second matching engine (off by your rule)', name: 'Hunter matching engine', desc: 'Separate engine and task table.' },

  // ---- team ----
  { id: 'L-audit', area: 'team', side: 'live', built: false, name: 'Activity feed (log-ins, sessions)', desc: 'Per-user log-ins and session length.' },
  { id: 'L-gsign', area: 'team', side: 'live', built: false, name: 'Google sign-in allow-list + Turnstile', desc: 'Only listed accounts get in.' },
];

export const BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
export const BUILT = FEATURES.filter((f) => f.built && !f.lock);

// Everything built starts on.
export const DEFAULT_FEATURES = Object.fromEntries(BUILT.map((f) => [f.id, true]));

export const PRESETS = [
  { name: 'Everything on', features: DEFAULT_FEATURES },
  {
    name: 'Lean sales desk',
    features: { ...DEFAULT_FEATURES, 'scr-dashboard': false, 'scr-users': false, 'dash-pipeline': false, 'dash-margin': false, 'inv-margin': false, 'match-bulk': false, 'today-quicktask': false },
  },
  {
    name: 'Sourcing only',
    features: Object.fromEntries(BUILT.map((f) => [f.id, ['screens', 'source', 'inv'].includes(f.area) && !['scr-board', 'scr-leads', 'scr-dashboard', 'scr-users'].includes(f.id)])),
  },
];

/** Resolve the saved switch map: unknown or missing ids fall back to the default; locked or unbuilt ids are always off. */
export function resolveFeatures(saved) {
  const out = { ...DEFAULT_FEATURES };
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) if (k in DEFAULT_FEATURES) out[k] = !!v;
  }
  return out;
}

// ---------------- Look & Layout ----------------
export const TAB_KEYS = ['today', 'match', 'leads', 'board', 'inventory', 'ingest', 'dashboard', 'users', 'settings'];
export const GOOGLE_FONTS = ['Orbitron', 'Audiowide', 'Rajdhani', 'Chakra Petch', 'Exo 2', 'Michroma', 'Space Grotesk', 'Inter'];
export const SELF_HOSTED_FONTS = ['Barlow Condensed', 'Black Ops One', 'IBM Plex Mono', 'Inter'];

export const LOOK_DEFAULT = {
  shell: 'cockpit', // cockpit (left sidebar) | command (Lead Desk style top bar)
  theme: 'neon', // neon | command | jobsite | clean
  glow: 'full', // full | soft | off
  grid: true,
  tabFonts: true,
  fonts: { today: 'Orbitron', match: 'Audiowide', leads: 'Rajdhani', board: 'Chakra Petch', inventory: 'Exo 2', ingest: 'Michroma', dashboard: 'Space Grotesk', users: 'Space Grotesk', settings: 'Space Grotesk' },
  mode: 'dark', // team default: dark | white
  perUserMode: true, // each user may switch dark / white for themselves
  phoneBar: true, // phones: scrolling top bar (true) or a Menu button (false)
  selfHostFonts: false, // load fonts from this server instead of Google Fonts
  sounds: false,
  sound: 'pick-up-the-phone', // pick-up-the-phone | dialing | kick
};

export function resolveLook(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return { ...LOOK_DEFAULT, ...s, fonts: { ...LOOK_DEFAULT.fonts, ...(s.fonts || {}) } };
}

export const SOUNDS = [['pick-up-the-phone', 'Pick up the phone'], ['dialing', 'Dialing tone'], ['kick', 'Kick']];

/** Play the dialer sound if Look & Layout has it on. Browsers only allow this after a click, which is where it is called. */
export function playDialer(look) {
  if (!look?.sounds) return;
  try {
    const a = new Audio(`${import.meta.env.BASE_URL}sounds/${look.sound || 'pick-up-the-phone'}.mp3`);
    a.volume = 0.6;
    a.play().catch(() => {});
  } catch { /* audio unavailable */ }
}
