// BAM CRM Zero-API Direct Engine (Hostinger PHP/PDO + Browser Storage Mirror)
// Eliminates the Node/Express API on port 4000.
// - On Hostinger (/inventory/cockpit.php): hydrates from MySQL PDO (`window.BAM_PDO_STATE`) and syncs writes directly to `cockpit.php` via PHP POST + CSRF.
// - On PC / Standalone: runs 100% in-browser backed by the same MySQL table schema (`inventory`, `leads`, `users`, `email_drafts`, `crm_audit`, `tw_tasks`, `tw_assign`).

import { extractDimensions, extractWeight } from './specExtract.js';
import { isThirdParty, listingTasks } from './pipeline.js';
import { BAM_LOGO_BASE64 } from './assets/bamLogoBase64.js';

export const STAGES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];
export const URGENCY = ['Low', 'Medium', 'High'];
export const UNIT_STATUSES = ['Draft', 'Live', 'Sold'];
export const CLOSED = ['Won', 'Lost'];

const STORAGE_KEY = 'bam_crm_pdo_mirror_v3';
const SESSION_KEY = 'bam_crm_active_user_v3';

const DEFAULT_CONFIG = {
  company: 'Big Ass Motors LLC',
  tagline: "YOU CAN'T DEPOSIT EXCUSES",
  hq: 'Jacksonville, FL',
  address: 'JACKSONVILLE, FL 32205',
  phone: '904-767-5232',
  mobile: '904-729-1051',
  email: 'sales@bigassmotors.com',
  web: 'www.bigassmotors.com',
  authority: "NORTH AMERICA'S HEAVY EQUIPMENT AUTHORITY",
  established: 'EST. 2012 • FAMILY OWNED & OPERATED',
  services: 'BUY • SELL • SOURCE • SHIP — US & MX',
  agent: 'James',
  closing: 'Call or text for a walk-around video and inspection details.',
  goldHex: '#FFC107',
  density: 'standard',
  teamAssignMode: 'round_robin',
  defaultFollowUpHour: 10,
};

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'bam-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now());
const nowIso = () => new Date().toISOString();
const offsetIso = (days = 0, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// ---------------- Matching Engine (0-100 Rule-Based Scoring) ----------------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FAMILIES = [['trencher', (n) => /trencher|rocksaw|plow/.test(n) && !/snow/.test(n)]];
const family = (cat) => {
  const n = norm(cat).replace(/s$/, '');
  const f = FAMILIES.find(([, test]) => test(n));
  return f ? f[0] : n;
};
const series = (s) => (norm(s).match(/^[a-z]+\d+/) || [''])[0];

export function scoreMatch(lead, unit) {
  const w = lead.wants || {};
  let earned = 0;
  let max = 0;
  let typeOk = true;
  const reasons = [];
  const add = (key, label, weight, frac, ok = frac >= 0.99) => {
    max += weight;
    earned += weight * frac;
    if (label) reasons.push({ key, label, ok, partial: !ok && frac > 0 }); // a spec that is not on file is never named
  };

  if (w.category) {
    const a = family(w.category);
    const b = family(unit.category);
    typeOk = !!a && a === b;
    add('category', 'Type', 25, typeOk ? 1 : 0);
  }
  if (w.make) add('make', 'Brand', 15, norm(w.make) === norm(unit.make) ? 1 : 0);
  if (w.model) {
    const a = norm(w.model);
    const b = norm(unit.model);
    let f = 0;
    if (a && b && (b.includes(a) || a.includes(b))) f = 1;
    else if (series(a) && series(a) === series(b)) f = 0.7;
    add('model', f === 1 ? 'Model' : 'Same series', 20, f, f === 1);
  }
  if (lead.budgetMax) {
    const price = unit.listPrice || unit.askPrice || 0;
    const f = !price ? 0.5 : price <= lead.budgetMax ? 1 : price <= lead.budgetMax * 1.1 ? 0.5 : 0;
    add('budget', f === 0.5 && price ? 'Near budget' : 'In budget', 20, f, f === 1);
  }
  if (lead.maxHours) {
    const h = unit.hours;
    const f = h == null ? 0 : h <= lead.maxHours ? 1 : h <= lead.maxHours * 1.2 ? 0.5 : 0;
    add('hours', h == null ? '' : f === 1 ? 'Hours OK' : 'Hours slightly over', 10, f, f === 1);
  }
  if (lead.minHp) {
    const hp = unit.hp ?? unit.oemSpecs?.hp;
    const f = hp == null ? 0 : hp >= lead.minHp ? 1 : 0;
    add('hp', hp == null ? '' : 'HP OK', 10, f, f === 1);
  }
  if (w.minYear) add('year', 'Year', 5, unit.year && unit.year >= w.minYear ? 1 : 0);

  const hasCore = w.category || w.make || w.model;
  let pct = !hasCore || !max ? 0 : Math.round((earned / max) * 100);
  if (!typeOk) pct = Math.min(pct, 39);
  return { score: pct, reasons };
}

// Matching scope (BAM rule): only scraped / third-party machines get matched to buyers, never BAM's existing inventory.
// Live data carries thirdParty (inventory.url_listing = 1, set by Add from URL / the uploader); local units fall back to
// having a source URL. Sold units never match.
export const isMatchable = (u) =>
  !!u && u.status !== 'Sold' && (u.thirdParty === true || (u.thirdParty === undefined && !!String(u.sourceUrl || '').trim()));

export function topBuyers(unit, leads, { limit = 3, min = 40 } = {}) {
  if (!isMatchable(unit)) return [];
  return leads
    .filter((l) => !CLOSED.includes(l.stage))
    .map((l) => ({ lead: l, ...scoreMatch(l, unit) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function unitsForLead(lead, inventory, { limit = 5, min = 40 } = {}) {
  return inventory
    .filter(isMatchable)
    .map((u) => ({ unit: u, ...scoreMatch(lead, u) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------- Buyer-Safe Pitch & Spanish Call Detector ----------------
const ES_WORDS = /\b(hola|gracias|quiere|necesita|llamar|llam[eé]|equipo|m[aá]quina|ma[ñn]ana|precio|puedo|tiene|cu[aá]ndo|buenos|enviar|env[ií]a)\b/i;
export const detectSpanish = (text) => ES_WORDS.test(text || '');
const money = (n) => (n ? '$' + Math.round(n).toLocaleString('en-US') : null);
export const unitTitle = (u) => [u.year, u.make, u.model].filter(Boolean).join(' ');

export function draftPitch(lead, unit, cfg = DEFAULT_CONFIG) {
  const es = lead.language === 'es';
  const first = lead.firstName || 'there';
  const hours = unit.hours != null ? `${Number(unit.hours).toLocaleString('en-US')} hrs` : null;
  const service = unit.serviceHistory && !/not verified/i.test(unit.serviceHistory) ? unit.serviceHistory : null;
  const price = money(unit.listPrice);
  const title = unitTitle(unit);
  const agent = cfg.agent || 'James';
  const company = cfg.company || 'Big Ass Motors LLC';
  const bits = [hours, service].filter(Boolean).join(' · ');

  if (es) {
    const sms = `Hola ${first}, soy ${agent} de ${company}. Tengo un ${title}${bits ? ` (${bits})` : ''} listo para trabajo. ${price ? `Precio: ${price}. ` : 'Llame para el precio. '}¿Cuándo lo necesita en obra? Le envío la ficha técnica oficial de 2 páginas ahora.`;
    return { sms, subject: `${title} — ficha técnica oficial`, body: `${sms}\n\nSaludos,\n${agent}\n${company}\n${cfg.phone || '904-767-5232'}` };
  }
  const sms = `Hi ${first}, ${agent} with ${company}. I have a ${title}${bits ? ` (${bits})` : ''} ready to work. ${price ? `Priced at ${price}. ` : 'Call for price. '}When do you need it on site${lead.city ? ' in ' + lead.city : ''}? Sending you the 2-page official brochure now.`;
  return {
    sms,
    subject: `${title} — official brochure`,
    body: `Hi ${first},\n\n${sms.replace(/^Hi [^,]+, /, '')}\n\nThanks,\n${agent}\n${company}\n${cfg.phone || '904-767-5232'}`,
  };
}

export function nextWeekdayAt10(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

export function followUpDraft(lead, note, cfg = DEFAULT_CONFIG) {
  const es = lead.language === 'es' || detectSpanish(note);
  const first = lead.firstName || '';
  return es
    ? `Hola ${first}, gracias por su tiempo hoy. Quedo atento a lo que hablamos. ¿Le mando fotos y la ficha técnica? — ${cfg.agent}, ${cfg.company}`
    : `Hi ${first}, thanks for your time today. Following up on what we discussed. Want me to send photos and the spec sheet? — ${cfg.agent}, ${cfg.company}`;
}

// ---------------- Heuristic Listing Parser (Never Guesses) ----------------
const MAKES = ['Vermeer', 'Ditch Witch', 'Caterpillar', 'CAT', 'John Deere', 'Case', 'Komatsu', 'Kubota',
  'Bobcat', 'Hitachi', 'Volvo', 'JCB', 'Astec', 'Toro', 'American Augers', 'Barbco', 'Trencor', 'Takeuchi',
  'Gradall', 'Altec', 'Terex', 'Hyundai', 'Doosan', 'Kobelco', 'Liebherr', 'Sullair'];

const CATEGORIES = [
  [/\b(hdd|directional|horizontal drill|drill rig)\b|\bD\d{2}x\d{2}\b|\bJT\s?\d{2,4}\b/i, 'HDD Drill'],
  [/\b(vacuum|hydrovac|vac ?ex)/i, 'Vacuum Excavator'],
  [/\b(rock ?saw)\b/i, 'Rock Saw'],
  [/\b(trencher|trenching|plow)\b|\bRTX?\s?\d{2,4}\b/i, 'Trencher'],
  [/\b(blast ?hole)\b/i, 'Blasthole Drill'],
  [/\b(backhoe)\b/i, 'Backhoe'],
  [/\b(excavator)\b/i, 'Excavator'],
  [/\b(dozer|crawler tractor)\b/i, 'Dozer'],
  [/\b(motor ?grader|grader)\b/i, 'Motor Grader'],
  [/\b(skid ?steer|track loader)\b/i, 'Skid Steer'],
  [/\b(wheel loader|loader)\b/i, 'Loader'],
];

const DEFECT_WORDS = ['leak', 'leaks', 'needs repair', 'needs work', 'broken', 'not running', "doesn't run",
  'rust', 'cracked', 'as-is', 'as is', 'blown', 'worn', 'damage', 'damaged', 'fault', 'engine knock', 'overheat'];

const OEM_BENCHMARKS = [
  { match: 'rtx1250', engine: 'Cummins QSB4.5', hp: 130, operatingWeight: '26,500 lbs' },
  { match: 'rt125', engine: 'Deutz TCD 3.6 L4', hp: 121, operatingWeight: '16,200 lbs' },
  { match: 'rt115', engine: 'Cummins QSB4.5', hp: 115, operatingWeight: '14,800 lbs' },
  { match: 'd60x90', engine: 'Cummins QSB6.7', hp: 225, operatingWeight: '29,300 lbs' },
  { match: 'd40x55', engine: 'John Deere 4045', hp: 140, operatingWeight: '22,500 lbs' },
  { match: 'd24x40', engine: 'John Deere 4045', hp: 125, operatingWeight: '14,500 lbs' },
  { match: '320e', engine: 'Cat C6.6 ACERT', hp: 152, operatingWeight: '48,700 lbs' },
];

// Marketplace pages append other people's listings and site menus after the real one ("Today's picks",
// "Related searches", sponsored ads). Everything from the first such marker on is dropped before parsing,
// so another listing's price, defects or category never leaks into this unit.
const FEED_MARKERS = /\b(Related searches|Today's picks|Today’s picks|Sponsored|Similar (?:items|listings)|Recommended for you|More (?:listings|from this seller)|Other listings|See more on Facebook|You may also like)\b/i;
const SITE_CHROME = /\b(Log In|Forgot Account\?|Create new listing|Browse all|Your account|Within \d+ (?:km|mi))\b/gi;
export function trimFeedJunk(text) {
  const s = String(text || '');
  const cut = s.search(FEED_MARKERS);
  return (cut > 0 ? s.slice(0, cut) : s).replace(SITE_CHROME, ' ');
}

// Model codes read as typed by sellers ("rt70"); show the letter prefix in capitals ("RT70", "D60x90" unchanged).
export const fmtModel = (m) => String(m || '').trim().replace(/^[a-z]+(?=-?\d)/i, (p) => p.toUpperCase());

export function parseListingText(raw, url = '') {
  const rawStr = String(raw || '');
  // Extract all photo URLs from raw HTML or text before stripping tags
  const extractedPhotos = [];
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = imgTagRegex.exec(rawStr)) !== null) {
    if (/^https?:\/\//i.test(m[1]) && !/logo|icon|tracking|pixel|avatar/i.test(m[1])) {
      extractedPhotos.push(m[1]);
    }
  }
  const ogImgRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = ogImgRegex.exec(rawStr)) !== null) {
    if (/^https?:\/\//i.test(m[1])) extractedPhotos.push(m[1]);
  }
  const rawUrlRegex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi;
  while ((m = rawUrlRegex.exec(rawStr)) !== null) {
    if (!/logo|icon|avatar|favicon/i.test(m[0])) extractedPhotos.push(m[0]);
  }

  const t = trimFeedJunk(rawStr
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'"))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
  const f = {};
  f.media = [...new Set(extractedPhotos)].slice(0, 16);
  const year = t.match(/\b(19[89]\d|20[0-3]\d)\b/);
  if (year) f.year = Number(year[1]);

  const make = MAKES.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(t));
  if (make) f.make = make === 'CAT' ? 'Caterpillar' : make;

  if (make) {
    const after = t.split(new RegExp(`\\b${make}\\b`, 'i'))[1] || '';
    const model = after.trim().match(/^([A-Za-z]{0,4}-?\d[\w\-./]*(?:\s(?:Quad|S3|Series|II|XL|LGP|AWD|M3))?)/);
    if (model) f.model = fmtModel(model[1].replace(/[.,]$/, ''));
  }
  // The model code is the strongest signal (RT70 = trencher, JT20 = drill); fall back to the listing's words.
  const catFrom = (s) => (CATEGORIES.find(([re]) => re.test(s)) || [])[1];
  const cat = (f.model && catFrom(f.model)) || catFrom(t);
  if (cat) f.category = cat;
  const hours = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:(?:engine|meter|machine|total|actual|working|original)\s+)?(?:hours|hrs|hr)\b/i);
  if (hours) f.hours = Number(hours[1].replace(/,/g, ''));
  const price = t.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d{4,7})/);
  if (price) f.askPrice = Number(price[1].replace(/,/g, ''));
  const serial = t.match(/\b(?:serial(?: number| no\.?| #)?|s\/n|vin|pin)\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,})/i);
  if (serial) f.serial = serial[1].toUpperCase();
  const loc = t.match(/\b(?:listed in|located in|location:?|in)\s+([A-Z][A-Za-z.\s]{2,25}),\s*([A-Z]{2})\b/);
  if (loc) { f.city = loc[1].trim(); f.state = loc[2]; }
  const defects = DEFECT_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));
  if (defects.length) f.knownDefects = defects.join(', ');
  if (/fully serviced|recent(ly)? serviced|service records/i.test(t)) {
    f.serviceHistory = 'Seller states: serviced (records not verified)';
  }

  const wt = extractWeight(t);
  if (wt) f.weight = wt;
  const dm = extractDimensions(t);
  if (dm) f.dimensions = dm;

  const oemSpecs = {};
  if (f.model) {
    const key = f.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = OEM_BENCHMARKS.find((o) => key.includes(o.match));
    if (hit) {
      const { match, operatingWeight, ...specs } = hit; // weight is never filled in from a table: only from the listing
      Object.assign(oemSpecs, specs);
    }
  }
  const pending = ['year', 'make', 'model', 'serial', 'hours'].filter((k) => f[k] == null);
  if (f.hp == null && oemSpecs.hp == null) pending.push('hp');

  if (url) f.sourceUrl = url;
  return { fields: f, oemSpecs, pending };
}

// ---------------- Initial Seed Matching Hostinger MySQL PDO Tables ----------------
function buildInitialState() {
  if (typeof window !== 'undefined' && window.BAM_PDO_STATE) {
    return window.BAM_PDO_STATE;
  }
  const users = [
    { id: 1, email: 'sales@bigassmotors.com', name: 'James', role: 'admin', active: 1, google_allowed: 1, last_login_at: offsetIso(0, 9), last_login_via: 'google' },
    { id: 2, email: 'adrienne@bigassmotors.com', name: 'Adrienne', role: 'admin', active: 1, google_allowed: 1, last_login_at: offsetIso(-1, 14), last_login_via: 'google' },
    { id: 3, email: 'fernanda@bigassmotors.com', name: 'Fernanda', role: 'sales', active: 1, google_allowed: 1, last_login_at: offsetIso(0, 8), last_login_via: 'password' },
    { id: 4, email: 'mattc@bigassmotors.com', name: 'Matt', role: 'broker', active: 1, google_allowed: 1, last_login_at: offsetIso(-1, 11), last_login_via: 'password' },
  ];

  const L = (id, o) => ({
    id, createdAt: offsetIso(-10), language: 'en', source: 'MySQL CRM', interactions: [], notes: '',
    stage: 'New', urgency: 'Medium', ownerId: 1, ownerName: 'James (Admin)', ...o,
  });

  const leads = [
    L('lead-1', { firstName: 'Wes', lastName: 'Harlan', email: 'wes@westtxtrenching.example', phone: '(432) 555-0114', company: 'West Texas Trenching', city: 'Midland', state: 'TX', stage: 'Qualified', urgency: 'High', budgetMax: 120000, maxHours: 1800, minHp: 120, ownerId: 1, ownerName: 'James (Admin)', wants: { make: 'Ditch Witch', model: 'RT125', category: 'Trencher', minYear: 2018 }, interactions: [{ id: uid(), at: offsetIso(-6), type: 'call', note: 'Wants combo plow/trencher, needs it by spring.' }] }),
    L('lead-2', { firstName: 'Mike', lastName: 'Duarte', email: 'mike@duartebore.example', phone: '(305) 555-0172', company: 'Duarte Directional', city: 'Miami', state: 'FL', stage: 'Negotiation', urgency: 'High', language: 'es', budgetMax: 420000, maxHours: 4500, ownerId: 3, ownerName: 'Fernanda', wants: { make: 'Vermeer', model: 'D60x90', category: 'HDD Drill' }, interactions: [{ id: uid(), at: offsetIso(-3), type: 'call', note: 'Quiere inspección la próxima semana.' }] }),
    L('lead-3', { firstName: 'Brad', lastName: 'Lambert', email: 'brad@gulfcoastdewater.example', phone: '(229) 555-0148', company: 'Gulf Coast Dewatering', city: 'Panama City', state: 'FL', stage: 'Negotiation', urgency: 'High', budgetMax: 246000, maxHours: 2500, minHp: 120, ownerId: 1, ownerName: 'James (Admin)', wants: { make: 'Vermeer', model: 'RTX1250', category: 'Trencher' }, interactions: [{ id: uid(), at: offsetIso(-2), type: 'call', note: 'Comparing against a new unit. Budget firm.' }] }),
    L('lead-4', { firstName: 'Jim', lastName: 'Kirton', email: 'jim@redkoon.example', phone: '(901) 555-0190', company: 'Red Koon Utilities', city: 'Memphis', state: 'TN', stage: 'Qualified', budgetMax: 230000, maxHours: 2000, ownerId: 1, ownerName: 'James (Admin)', wants: { make: 'Vermeer', model: 'RTX1250', category: 'Trencher' } }),
    L('lead-5', { firstName: 'Debra', lastName: 'Chapman', email: 'debra@dig1.example', phone: '(512) 555-0133', company: 'Dig One Services', city: 'Austin', state: 'TX', stage: 'Contacted', budgetMax: 200000, ownerId: 3, ownerName: 'Fernanda', wants: { make: 'Vermeer', category: 'Trencher' } }),
    L('lead-6', { firstName: 'Tom', lastName: 'Reyes', email: 'tom@reyesexcavating.example', phone: '(713) 555-0166', company: 'Reyes Excavating', city: 'Houston', state: 'TX', stage: 'New', urgency: 'Low', budgetMax: 90000, maxHours: 6000, ownerId: 1, ownerName: 'James (Admin)', wants: { make: 'Caterpillar', model: '320E', category: 'Excavator' } }),
    L('lead-7', { firstName: 'Ana', lastName: 'Morales', email: 'ana@moralesvac.example', phone: '(904) 555-0121', company: 'Morales Vac Services', city: 'Jacksonville', state: 'FL', stage: 'Contacted', budgetMax: 60000, ownerId: 3, ownerName: 'Fernanda', wants: { category: 'Vacuum Excavator' } }),
    L('lead-8', { firstName: 'Carl', lastName: 'Owens', email: 'carl@owensgrading.example', phone: '(615) 555-0177', company: 'Owens Grading', city: 'Nashville', state: 'TN', stage: 'Won', ownerId: 1, ownerName: 'James (Admin)', wants: { make: 'Caterpillar', category: 'Dozer' } }),
  ];

  const U = (id, o) => ({
    id, createdAt: offsetIso(-5), status: 'Live', media: [], pendingFields: [], oemSpecs: {},
    serviceHistory: '', inspectionNotes: '', sellerStatus: 'Motivated', verified: true, ...o,
  });

  const inventory = [
    U('unit-1', { stock: 'BAM-1001', year: 2020, make: 'Ditch Witch', model: 'RT125 Quad', category: 'Trencher', hours: 1140, hp: 125, serial: 'DW2020RT125Q01', askPrice: 89500, listPrice: null, buyPrice: 82000, city: 'Phoenix', state: 'AZ', serviceHistory: 'Full dealer service records', narrative: 'Quad-track trencher with complete dealer records and walk-around video available.' }),
    U('unit-2', { stock: 'BAM-1002', year: 2019, make: 'Ditch Witch', model: 'RT125', category: 'Trencher', hours: 1620, hp: 125, serial: 'DW2019RT12502', askPrice: 94000, listPrice: 112000, buyPrice: 86000, city: 'Raleigh', state: 'NC', narrative: 'Clean RT125 with fresh chain and teeth.' }),
    U('unit-3', { stock: 'BAM-1003', year: 2021, make: 'Vermeer', model: 'RTX1250I2', category: 'Trencher', hours: 1084, hp: 130, serial: '', askPrice: 215000, listPrice: null, buyPrice: 203000, city: 'Simpsonville', state: 'SC', oemSpecs: { engine: 'Cummins QSB4.5', hp: 130 }, pendingFields: ['serial'], status: 'Draft', verified: false, sourceUrl: 'https://www.machinerytrader.com/', narrative: 'Quad-track RTX1250 trencher. Serial pending inspection.' }),
    U('unit-4', { stock: 'BAM-1004', year: 2018, make: 'Vermeer', model: 'D60x90', category: 'HDD Drill', hours: 4000, serial: '', askPrice: 385000, listPrice: null, buyPrice: 360000, city: 'Dallas', state: 'TX', oemSpecs: { engine: 'Cummins QSB6.7', hp: 225 }, pendingFields: ['serial', 'hp', 'weight', 'dimensions'], status: 'Draft', verified: false, serviceHistory: 'Seller states: fully serviced (records not verified)', narrative: 'Ready-to-work 60x90 HDD with 600 ft of drill pipe included.' }),
    U('unit-5', { stock: 'BAM-1005', year: 2014, make: 'Caterpillar', model: '320E', category: 'Excavator', hours: 6200, serial: 'CAT320E0099', askPrice: 78000, listPrice: 92000, buyPrice: 70000, city: 'Houston', state: 'TX', narrative: 'Well-maintained 320E excavator.' }),
    U('unit-6', { stock: 'BAM-1006', year: 2017, make: 'Vermeer', model: 'RTX1250 Rocksaw', category: 'Rock Saw', hours: 1720, hp: 130, serial: 'VM2017RTX0155', askPrice: 189000, listPrice: null, buyPrice: 175000, city: 'Austin', state: 'TX', narrative: 'Rock saw configuration, strong hours.' }),
  ];

  const tasks = [
    { id: 'task-1', title: 'Follow up: Wes Harlan', leadId: 'lead-1', due: offsetIso(-1, 14), done: false, priority: 'high', assignedTo: 1 },
    { id: 'task-2', title: 'Send quote sheet to Brad Lambert', leadId: 'lead-3', due: offsetIso(0, 16), done: false, priority: 'normal', assignedTo: 1 },
    { id: 'task-3', title: 'Verify serial on BAM-1004', leadId: null, due: offsetIso(0, 11), done: false, priority: 'high', assignedTo: 1 },
  ];

  const email_drafts = [
    { id: 101, kind: 'unit_match', inventory_id: 'unit-1', lead_id: 'lead-1', to_email: 'wes@westtxtrenching.example', to_name: 'Wes Harlan', subject: '2020 Ditch Witch RT125 Quad — official brochure', body: 'Hi Wes,\n\nI have a 2020 Ditch Witch RT125 Quad (1,140 hrs · Full dealer service records) ready to work. Call for price. When do you need it on site in Midland? Sending you the 2-page official brochure now.\n\nThanks,\nJames\nBig Ass Motors LLC', status: 'Draft', created_at: offsetIso(-1, 11) },
    { id: 102, kind: 'unit_match', inventory_id: 'unit-4', lead_id: 'lead-2', to_email: 'mike@duartebore.example', to_name: 'Mike Duarte', subject: '2018 Vermeer D60x90 — ficha técnica oficial', body: 'Hola Mike, soy James de Big Ass Motors LLC. Tengo un 2018 Vermeer D60x90 (4,000 hrs) listo para trabajo. Llame para el precio. ¿Cuándo lo necesita en obra? Le envío la ficha técnica oficial de 2 páginas ahora.', status: 'Draft', created_at: offsetIso(0, 9) },
  ];

  const crm_audit = [
    { id: 501, user_id: 1, email: 'sales@bigassmotors.com', role: 'admin', event: 'login_google', detail: 'Google sign-in verified on access list', path: '/inventory/login.php', ip: '127.0.0.1', created_at: offsetIso(0, 9) },
    { id: 502, user_id: 1, email: 'sales@bigassmotors.com', role: 'admin', event: 'verify_unit', detail: 'Verified unit BAM-1001 & attached 2-page brochure', path: '/inventory/api/hub/verify.php', ip: '127.0.0.1', created_at: offsetIso(0, 9) },
    { id: 503, user_id: 3, email: 'fernanda@bigassmotors.com', role: 'sales', event: 'call_logged', detail: 'Logged Spanish call with Mike Duarte (Duarte Directional)', path: '/inventory/cockpit.php', ip: '127.0.0.1', created_at: offsetIso(0, 10) },
  ];

  return {
    config: { ...DEFAULT_CONFIG },
    users,
    leads,
    inventory,
    tasks,
    matches: [],
    email_drafts,
    crm_audit,
  };
}

let stateCache = null;

// Older versions kept plain-text passwords in browser storage; remove them on load.
function scrubPasswords(st) {
  let changed = false;
  for (const u of st?.users || []) if ('password_plain' in u) { delete u.password_plain; changed = true; }
  return changed;
}

function loadState() {
  if (stateCache) return stateCache;
  if (typeof window !== 'undefined' && window.BAM_PDO_STATE) {
    stateCache = {
      ...buildInitialState(),
      ...window.BAM_PDO_STATE,
      config: { ...DEFAULT_CONFIG, ...(window.BAM_PDO_STATE.config || {}) },
    };
    scrubPasswords(stateCache);
    return stateCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.leads) && Array.isArray(parsed.inventory)) {
        stateCache = {
          ...buildInitialState(),
          ...parsed,
          config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        };
        if (scrubPasswords(stateCache)) localStorage.setItem(STORAGE_KEY, JSON.stringify(stateCache));
        return stateCache;
      }
    }
  } catch {}
  stateCache = buildInitialState();
  saveState();
  return stateCache;
}

function saveState(syncAction = null, syncPayload = null) {
  if (!stateCache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateCache));
  } catch {}
  // If running inside Hostinger PHP (/inventory/cockpit.php), also persist directly to MySQL PDO via standard PHP POST (no separate API server)
  if (syncAction && typeof window !== 'undefined' && window.BAM_PHP_ENDPOINT) {
    const fd = new FormData();
    fd.append('_csrf', window.BAM_CSRF || '');
    fd.append('do', syncAction);
    fd.append('payload', JSON.stringify(syncPayload || {}));
    fetch(window.BAM_PHP_ENDPOINT, { method: 'POST', body: fd, credentials: 'same-origin' }).catch(() => {});
  }
}

export function recordAudit(event, detail = '', path = '/inventory/cockpit.php') {
  const s = loadState();
  const me = getCurrentUser() || { id: 1, email: 'sales@bigassmotors.com', role: 'admin' };
  const row = {
    id: (s.crm_audit[0]?.id || 500) + 1,
    user_id: me.id,
    email: me.email,
    role: me.role,
    event,
    detail,
    path,
    ip: 'Hostinger PDO',
    created_at: nowIso(),
  };
  s.crm_audit.unshift(row);
  s.crm_audit = s.crm_audit.slice(0, 250);
  saveState('audit', row);
  return row;
}

// ---------------- Auth / Existing Hostinger Login Gate (`inventory/login.php`) ----------------
export function getCurrentUser() {
  if (typeof window !== 'undefined' && window.BAM_ME) {
    return window.BAM_ME;
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      if ('password_plain' in u || 'password_hash' in u) localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser(u)));
      return publicUser(u);
    }
  } catch {}
  return null;
}

// Passwords are never stored or shipped in plain text: only a per-user random salt and SHA-256(salt + password).
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(password, salt) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));
}
export async function makePasswordFields(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { password_salt: salt, password_hash: await hashPassword(password, salt) };
}
// What a session or a sync payload may carry: never the password fields.
export const publicUser = ({ password_plain, password_hash, password_salt, ...rest }) => rest;

export async function loginWithPassword(email, password) {
  const s = loadState();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const u = (s.users || []).find((x) => x.email.toLowerCase() === cleanEmail && x.active);
  const ok = u && u.password_hash && u.password_salt && (await hashPassword(String(password || ''), u.password_salt)) === u.password_hash;
  if (!ok) {
    recordAudit('login_failed', `Failed password login for ${cleanEmail}`, '/inventory/login.php');
    throw new Error(u && !u.password_hash ? 'No password is set for this account. Use Continue with Google, or ask an admin to set one.' : 'Wrong e-mail or password.');
  }
  u.last_login_at = nowIso();
  u.last_login_via = 'password';
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser(u)));
  recordAudit('login_password', `Signed in with password (${u.role})`, '/inventory/login.php');
  return u;
}

export function loginWithGoogle(email) {
  const s = loadState();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const u = (s.users || []).find((x) => x.email.toLowerCase() === cleanEmail);
  if (!u || !u.active || !u.google_allowed) {
    recordAudit('login_google_refused', `Google account ${cleanEmail} not on access list`, '/inventory/login.php');
    const err = new Error(`The Google account ${cleanEmail} isn't on the Big Ass Motors CRM access list.`);
    err.refusedEmail = cleanEmail;
    throw err;
  }
  u.last_login_at = nowIso();
  u.last_login_via = 'google';
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser(u)));
  recordAudit('login_google', `Google sign-in verified on access list (${u.role})`, '/inventory/login.php');
  return u;
}

export function logoutUser() {
  recordAudit('logout', 'Signed out of BAM CRM', '/inventory/logout.php');
  localStorage.removeItem(SESSION_KEY);
  if (typeof window !== 'undefined' && window.BAM_LOGOUT_URL) {
    window.location.href = window.BAM_LOGOUT_URL;
  }
}

// ---------------- Helpers ----------------
const REQUIRED = ['year', 'make', 'model', 'serial', 'hours'];
function pendingOf(u) {
  const missing = REQUIRED.filter((k) => u[k] == null || u[k] === '');
  if (u.hp == null || u.hp === '') missing.push('hp'); // weight and dimensions are shown only when stated, never flagged as missing
  return missing;
}

const withDerived = (u) => ({
  ...u,
  pendingFields: pendingOf(u),
  margin: (u.listPrice || u.askPrice) && u.buyPrice ? (u.listPrice || u.askPrice) - u.buyPrice : null,
});

const visibleLeadsForUser = (leads) => {
  const me = getCurrentUser();
  if (me && me.role === 'sales') {
    return leads.filter((l) => !l.ownerId || Number(l.ownerId) === Number(me.id) || (l.ownerName || '').toLowerCase().includes((me.name || '').toLowerCase()));
  }
  return leads;
};

// ---------------- Canonical 2-Page BAM Brochure HTML/PDF Window (Zero-API) ----------------
// ---------------- Photo store: keeps our own copies so expiring marketplace links can't break a brochure ----------------
const PHOTO_DB = 'bam-photos';
function photoDb() {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') { no(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(PHOTO_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function photoPut(key, blob) {
  const db = await photoDb();
  await new Promise((ok, no) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(blob, key); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
}
async function photoGet(key) {
  try {
    const db = await photoDb();
    return await new Promise((ok) => { const g = db.transaction('photos').objectStore('photos').get(key); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); });
  } catch { return null; }
}
const blobToDataUrl = (b) => new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(b); });

// Download each photo once (resized to 1400px, JPEG), keyed "<unitId>:<index>". Links that already expired are skipped.
export async function cacheUnitPhotos(unitId, urls = []) {
  let saved = 0;
  for (let i = 0; i < Math.min(urls.length, 12); i++) {
    const src = urls[i];
    if (!/^https?:\/\//i.test(src || '') || (await photoGet(`${unitId}:${i}`))) { saved++; continue; }
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) continue;
      const bmp = await createImageBitmap(await res.blob());
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const jpg = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
      if (jpg) { await photoPut(`${unitId}:${i}`, jpg); saved++; }
    } catch { /* blocked or expired: the original link stays as the fallback */ }
  }
  const s = loadState();
  const u = s.inventory.find((x) => String(x.id) === String(unitId));
  if (u && u.photosCached !== saved) { u.photosCached = saved; saveState(); }
  return saved;
}

const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function openCanonicalBrochure(unitId) {
  const s = loadState();
  const u = s.inventory.find((x) => String(x.id) === String(unitId));
  if (!u) return;
  if (typeof window !== 'undefined' && window.BAM_HOSTINGER_BROCHURE_URL) {
    window.open(`${window.BAM_HOSTINGER_BROCHURE_URL}?type=unit&ids=${encodeURIComponent(u.id)}`, '_blank');
    return;
  }
  // Open the window inside the click (pop-up blockers), then fill it once the stored photo is read.
  const w = window.open('', '_blank');
  if (!w) return;
  photoGet(`${u.id}:0`).then((b) => (b ? blobToDataUrl(b) : null)).then((stored) => writeBrochure(w, s, u, stored));
}

function writeBrochure(w, s, u, storedHero) {
  const cfg = s.config || DEFAULT_CONFIG;
  const model = fmtModel(u.model);
  const title = esc([u.year, u.make, model].filter(Boolean).join(' ').toUpperCase() || 'EQUIPMENT UNIT');
  const price = u.listPrice ? '$' + Math.round(u.listPrice).toLocaleString('en-US') : 'CALL FOR PRICE';
  const hours = hasVal(u.hours) ? Number(u.hours).toLocaleString('en-US') : '';
  const oem = u.oemSpecs || {};
  // Missing specs say "Pending Inspection"; an OEM reference value is labeled as one. Nothing is guessed.
  const engine = hasVal(u.engineModel) ? esc(u.engineModel) : hasVal(oem.engine) ? `${esc(oem.engine)} (OEM ref.)` : '';
  const hp = hasVal(u.hp) ? `${esc(u.hp)} HP` : hasVal(oem.hp) ? `${esc(oem.hp)} HP (OEM ref.)` : '';
  // Operating weight and dimensions appear only when the listing (or the CRM record) states them. Otherwise the row is left out.
  const weight = hasVal(u.weight) ? esc(u.weight) : hasVal(oem.weight) ? esc(oem.weight) : '';
  const dims = hasVal(u.dimensions) ? esc(u.dimensions) : hasVal(oem.dimensions) ? esc(oem.dimensions) : '';
  const sub = esc([u.category, u.stock && `Stock ${u.stock}`].filter(Boolean).join('  •  '));
  const band = ['USED', hasVal(u.hours) ? `${hours} Hours` : null, 'Walk-Around Video Available', u.stock ? `Stock ${esc(u.stock)}` : null].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const allPhotos = [
    ...(storedHero ? [storedHero] : []),
    ...(Array.isArray(u.media) ? u.media : typeof u.media === 'string' ? u.media.split('\n') : []),
    ...(Array.isArray(u.photos) ? u.photos.map((p) => typeof p === 'string' ? p : (p.url || p.file_path || '')) : [])
  ].map((x) => String(x || '').trim()).filter(Boolean);
  const hero = allPhotos[0] || '';
  const morePhotos = allPhotos.slice(1, 4);
  const desc = esc(u.narrative || `${[u.year, u.make, model].filter(Boolean).join(' ')} offered by Big Ass Motors, Jacksonville, FL. Freight arranged across the US & Mexico.`);
  const makeModel = esc([u.make, model].filter(Boolean).join(' '));

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>BAM Official 2-Page Brochure — ${title}</title>
<style>
  @page { size: letter portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #1a1a1a; font-family: Helvetica, Arial, sans-serif; color: #141414; }
  .toolbar { position: sticky; top: 0; z-index: 20; background: #111; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FFC107; }
  .toolbar button { background: #FFC107; color: #111; border: 0; padding: 8px 16px; font-weight: 800; border-radius: 4px; cursor: pointer; text-transform: uppercase; }
  .page { width: 8.5in; height: 11in; margin: 18px auto; background: #fff; padding: 0.45in 0.55in 0.55in; position: relative; page-break-after: always; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid #FFC107; }
  .logo { width: 2.3in; height: auto; display: block; }
  .letterhead { text-align: right; font-size: 8.5px; font-weight: 700; line-height: 1.42; color: #141414; }
  .letterhead .co { font-size: 16px; font-weight: 900; letter-spacing: 2.5px; margin-bottom: 2px; }
  h1.t { text-align: center; font-size: 23px; font-weight: 900; margin: 12px 0 3px; letter-spacing: .5px; }
  .st { text-align: center; font-size: 12px; color: #555; margin-bottom: 8px; }
  .band { background: #111; color: #fff; text-align: center; font-weight: 800; font-size: 10.5px; padding: 7px 10px; letter-spacing: .6px; margin-bottom: 12px; }
  .hero { width: 100%; height: 2.85in; background: #f4f4f4; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 12px; }
  .hero img { width: 100%; height: 100%; object-fit: cover; }
  h2.s { font-size: 11.5px; font-weight: 900; text-transform: uppercase; padding-bottom: 4px; border-bottom: 2px solid #FFC107; margin: 10px 0 6px; }
  p.desc { font-size: 10.5px; line-height: 1.45; color: #222; margin: 0 0 10px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  ul.b { margin: 0; padding-left: 16px; font-size: 10px; line-height: 1.55; }
  .pricebar { position: absolute; left: 0.55in; right: 0.55in; bottom: 0.52in; background: #111; border: 2px solid #FFC107; color: #FFC107; text-align: center; font-weight: 900; font-size: 14px; padding: 9px; letter-spacing: .5px; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 0.34in; background: #111; color: #eee; font-size: 8.5px; display: flex; justify-content: space-between; align-items: center; padding: 0 0.55in; }
  .t2 { text-align: center; font-weight: 900; font-size: 15px; padding: 7px 0; border-top: 2px solid #FFC107; border-bottom: 2px solid #FFC107; margin: 10px 0 14px; }
  .ph3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 10px 0 12px; }
  .ph3 div { border: 1px solid #ccc; height: 1.5in; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f4f4f4; }
  .ph3 img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .specbox { background: #FFF7D6; border: 2px solid #FFC107; padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; font-size: 10px; margin-bottom: 14px; }
  .specrow { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,.06); padding: 3px 0; }
  .specrow b { color: #111; }
  .notebox { background: #FFF7D6; border: 2px solid #FFC107; padding: 10px 12px; font-size: 9.5px; line-height: 1.45; min-height: 1.25in; }
  .cta { position: absolute; left: 0.55in; right: 0.55in; bottom: 0.85in; background: #111; border: 2.5px solid #FFC107; text-align: center; padding: 12px; color: #fff; }
  .cta .a { color: #FFC107; font-size: 16px; font-weight: 900; margin-bottom: 4px; }
  .cta .b { font-size: 11px; margin-bottom: 4px; }
  .cta .c { font-size: 18px; font-weight: 900; margin-bottom: 2px; }
  .cta .d { font-size: 9.5px; color: #d7d7d7; }
  .disc { position: absolute; left: 0.55in; right: 0.55in; bottom: 0.42in; font-size: 7.5px; color: #666; text-align: center; line-height: 1.35; }
  @media print { body { background: #fff; } .toolbar { display: none; } .page { margin: 0; box-shadow: none; } }
</style></head>
<body>
  <div class="toolbar">
    <div><b>BIG ASS MOTORS</b> · Canonical 2-Page Buyer-Safe Brochure (${title})</div>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <!-- PAGE 1 -->
  <section class="page">
    <div class="head">
      <img class="logo" src="${BAM_LOGO_BASE64}" alt="Big Ass Motors">
      <div class="letterhead">
        <div class="co">BIG ASS MOTORS</div>
        <div>${cfg.authority}</div>
        <div>${cfg.established}</div>
        <div>${cfg.address}</div>
        <div>PHONE ${cfg.phone} · MOBILE ${cfg.mobile}</div>
        <div>EMAIL ${cfg.email} · WEB ${cfg.web}</div>
        <div>${cfg.services}</div>
      </div>
    </div>
    <h1 class="t">${title}</h1>
    <div class="st">${sub}</div>
    <div class="band">${band}</div>
    <div class="hero">${hero ? `<img src="${esc(hero)}" alt="">` : `<span style="color:#666;font-weight:700">Photos &amp; walk-around video available on request — Call ${cfg.phone}</span>`}</div>
    <h2 class="s">Unit Description</h2>
    <p class="desc">${desc}</p>
    <div class="cols">
      <div>
        <h2 class="s">Key Highlights</h2>
        <ul class="b">
          ${hasVal(u.hours) ? `<li>${hours} hours on a ${esc([u.year, model].filter(Boolean).join(' '))}.</li>` : ''}
          <li>Engine: ${engine}</li>
          <li>Horsepower: ${hp}</li>
          <li>Walk-around video and inspection details available.</li>
          <li>Freight available across the US &amp; Mexico.</li>
        </ul>
      </div>
      <div>
        <h2 class="s">Specs at a Glance</h2>
        <ul class="b">
          <li><b>Hours:</b> ${hours}</li>
          <li><b>Category:</b> ${esc(u.category || 'Heavy Equipment')}</li>
          <li><b>Condition:</b> Used</li>
          <li><b>Make / Model:</b> ${makeModel}</li>
          <li><b>Gross Power:</b> ${hp}</li>
          <li><b>Stock #:</b> ${esc(u.stock || 'BAM')}</li>
        </ul>
      </div>
    </div>
    <div class="pricebar">${u.listPrice ? `PRICE: ${price}` : 'CALL FOR PRICE'} &nbsp;•&nbsp; ${cfg.phone} &nbsp;•&nbsp; ${cfg.email}</div>
    <div class="foot"><span>Big Ass Motors • Jacksonville, FL • US &amp; MX Coverage</span><span>Page 1</span><span>${cfg.web} • ${cfg.phone}</span></div>
  </section>
  <!-- PAGE 2 -->
  <section class="page">
    <div class="head">
      <img class="logo" src="${BAM_LOGO_BASE64}" alt="Big Ass Motors">
      <div class="letterhead">
        <div class="co">BIG ASS MOTORS</div>
        <div>${cfg.authority}</div>
        <div>${cfg.established}</div>
        <div>${cfg.address}</div>
        <div>PHONE ${cfg.phone} · MOBILE ${cfg.mobile}</div>
        <div>EMAIL ${cfg.email} · WEB ${cfg.web}</div>
        <div>OFFICIAL SPECIFICATION SHEET</div>
      </div>
    </div>
    <div class="t2">${title} &nbsp;•&nbsp; ${esc((u.category || 'HEAVY EQUIPMENT').toUpperCase())}</div>
    ${morePhotos.length ? `<div class="ph3">${morePhotos.map((ph) => `<div><img src="${esc(ph)}" alt=""></div>`).join('')}</div>` : ''}
    <h2 class="s">Technical Specifications — ${makeModel.toUpperCase()}</h2>
    <div class="specbox">
      <div class="specrow"><b>Year / Model</b><span>${title}</span></div>
      ${engine ? `<div class="specrow"><b>Engine</b><span>${engine}</span></div>` : ''}
      ${hours ? `<div class="specrow"><b>Hours</b><span>${hours}</span></div>` : ''}
      ${hp ? `<div class="specrow"><b>Horsepower</b><span>${hp}</span></div>` : ''}
      <div class="specrow"><b>Category</b><span>${esc(u.category || 'Heavy Equipment')}</span></div>
      ${weight ? `<div class="specrow"><b>Operating Weight</b><span>${weight}</span></div>` : ''}
      <div class="specrow"><b>Condition</b><span>Used</span></div>
      ${dims ? `<div class="specrow"><b>Dimensions</b><span>${dims}</span></div>` : ''}
      <div class="specrow"><b>Make / Model</b><span>${makeModel}</span></div>
      <div class="specrow"><b>Stock Number</b><span>${esc(u.stock || 'BAM')}</span></div>
    </div>
    <div class="cols">
      <div>
        <h2 class="s">Condition &amp; Service Notes</h2>
        <div class="notebox">${esc(u.serviceHistory) || 'Unit details are based on owner reports. Confirm hour meter, serial and a full inspection before deposit. Items shown in photos but not listed are not included. BAM can arrange freight across the US & Mexico.'}</div>
      </div>
      <div>
        <h2 class="s">Buying From BAM</h2>
        <div class="notebox">
          <div class="specrow"><b>Walk-around video</b><span>On request</span></div>
          <div class="specrow"><b>Transaction</b><span>Escrow-friendly, documented</span></div>
          <div class="specrow"><b>Freight</b><span>Arranged across the US &amp; Mexico</span></div>
          <div class="specrow"><b>Family owned</b><span>Operating since 2012</span></div>
        </div>
      </div>
    </div>
    <div class="cta">
      <div class="a">${u.listPrice ? `READY TO WORK — ${price}` : 'READY TO WORK — CALL FOR PRICE'}</div>
      <div class="b">Call or text for a walk-around video and inspection details.</div>
      <div class="c">${cfg.phone}</div>
      <div class="d">${cfg.email} &nbsp;•&nbsp; ${cfg.web}</div>
    </div>
    <div class="disc">Specifications, hour meter readings and condition descriptions are based on owner and OEM reports and are not guaranteed. Buyer is responsible for verifying all details and inspecting the machine prior to purchase. All units are offered subject to prior sale.</div>
    <div class="foot"><span>Big Ass Motors • Jacksonville, FL • US &amp; MX Coverage</span><span>Page 2</span><span>${cfg.web} • ${cfg.phone}</span></div>
  </section>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  recordAudit('brochure_opened', `Opened 2-page canonical brochure for ${u.stock || u.id}`);
}

// ---------------- Zero-API Service Methods ----------------
// ---------------- Sourcing watchlists (table `scraping_configs`) ----------------
// website is a machine key; the daily sweep script reads these rows from get_scraping_configs.php.
export const SCRAPE_WEBSITES = [['all', 'All websites'], ['facebook', 'Facebook Marketplace'], ['hdd_broker', 'HDD Broker'], ['direct_tech', 'Direct Tech']];

// On the live site (/new/) the watchlists live in MySQL behind get_scraping_configs.php (JSON, signed-in session). Locally they live in the browser.
const scrapingApiUrl = () => (typeof window !== 'undefined' && (window.BAM_SCRAPING_CONFIGS_URL || (window.location.pathname.startsWith('/new') ? '/inventory/api/get_scraping_configs.php' : null))) || null;
async function scrapingCall(url, method, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `The CRM answered HTTP ${r.status}.`);
  return j;
}

function seedScrapingConfigs() {
  // Starting watchlists: the Ditch Witch RT lineup Daley asked for, on Facebook Marketplace.
  return ['RT45', 'RT80', 'RT125', 'RT120', 'RT115'].map((model, i) => ({
    id: i + 1, website: 'facebook', manufacturer: 'Ditch Witch', model, year_min: null, year_max: null, price_min: null, price_max: null,
    keywords: null, active: 1, created_by: 1, created_at: nowIso(), updated_at: nowIso(),
  })).concat([{
    id: 6, website: 'facebook', manufacturer: 'Ditch Witch', model: '', year_min: null, year_max: null, price_min: null, price_max: null,
    keywords: 'Ditch Witch RT trencher', active: 1, created_by: 1, created_at: nowIso(), updated_at: nowIso(),
  }]);
}
const configRows = (s) => { if (!Array.isArray(s.scraping_configs)) s.scraping_configs = seedScrapingConfigs(); return s.scraping_configs; };

function cleanScrapingConfig(b) {
  const website = String(b.website || '');
  if (!SCRAPE_WEBSITES.some(([k]) => k === website)) throw new Error('Choose a website.');
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const num = (v, lo, hi, label) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${label} must be between ${lo} and ${hi}.`);
    return n;
  };
  const nextYear = new Date().getFullYear() + 1;
  const out = {
    website, manufacturer: text(b.manufacturer, 80), model: text(b.model, 80), keywords: text(b.keywords, 160) || null,
    year_min: num(b.year_min, 1950, nextYear, 'Year'), year_max: num(b.year_max, 1950, nextYear, 'Year'),
    price_min: num(b.price_min, 0, 100000000, 'Price'), price_max: num(b.price_max, 0, 100000000, 'Price'),
    active: b.active === 0 || b.active === false ? 0 : 1,
  };
  if (!out.manufacturer && !out.model && !out.keywords) throw new Error('Pick a manufacturer, a model or type a keyword.');
  if (out.year_min && out.year_max && out.year_min > out.year_max) throw new Error('Year from is after year to.');
  if (out.price_min != null && out.price_max != null && out.price_min > out.price_max) throw new Error('Price from is above price to.');
  return out;
}

export const localApi = {
  // ---------------- Sourcing watchlists ----------------
  scrapingConfigs: async () => {
    const url = scrapingApiUrl();
    if (url) return (await scrapingCall(`${url}?all=1`, 'GET')).configs || [];
    return [...configRows(loadState())].sort((a, b) => a.id - b.id);
  },
  saveScrapingConfig: async (b) => {
    const url = scrapingApiUrl();
    if (url) {
      const clean = cleanScrapingConfig(b);
      const j = await scrapingCall(url, 'POST', { action: 'save', ...(b.id ? { id: b.id } : {}), ...clean });
      return { ...clean, id: b.id || j.created || j.updated };
    }
    const s = loadState();
    const rows = configRows(s);
    const clean = cleanScrapingConfig(b);
    let row;
    if (b.id) {
      row = rows.find((r) => Number(r.id) === Number(b.id));
      if (!row) throw new Error('Watchlist not found.');
      Object.assign(row, clean, { updated_at: nowIso() });
    } else {
      row = { id: Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1, ...clean, created_by: getCurrentUser()?.id ?? null, created_at: nowIso(), updated_at: nowIso() };
      rows.push(row);
    }
    saveState('save_scraping_config', row);
    recordAudit('scraping_config_saved', `Watchlist #${row.id}: ${[row.manufacturer, row.model, row.keywords].filter(Boolean).join(' ')} on ${row.website}`);
    return row;
  },
  deleteScrapingConfig: async (id) => {
    const url = scrapingApiUrl();
    if (url) { await scrapingCall(url, 'POST', { action: 'delete', id }); return { ok: true }; }
    const s = loadState();
    const rows = configRows(s);
    const i = rows.findIndex((r) => Number(r.id) === Number(id));
    if (i === -1) throw new Error('Watchlist not found.');
    const [gone] = rows.splice(i, 1);
    saveState('delete_scraping_config', { id: gone.id });
    recordAudit('scraping_config_deleted', `Deleted watchlist #${gone.id}`);
    return { ok: true };
  },

  // ---------------- Verify -> match -> official brochure -> publish ----------------
  // Mirrors bam_app/inc/verify_publish.php. Only scraped (third-party) machines. Publishing happens only after the brochure step succeeds.
  verifyUnit: async (id) => {
    const s = loadState();
    const u = s.inventory.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Unit not found');
    if (!isThirdParty(u)) throw new Error('Only scraped third-party machines go through verify and publish.');
    const me = getCurrentUser();
    u.verified = true;
    u.verifiedAt = nowIso();
    u.verifiedBy = me?.id ?? null;
    const matches = topBuyers(u, visibleLeadsForUser(s.leads), { limit: 25, min: 40 }).length;
    // Official brochure: needs the machine's basic identity. Unstated specs are simply left out of it, never filled in.
    const brochureOk = !!(u.year && u.make && u.model);
    u.brochureReady = brochureOk;
    if (brochureOk) u.brochureAt = nowIso();
    const published = brochureOk;
    if (published) { u.isPublic = 1; u.status = 'Live'; }
    saveState('save_unit', u);
    recordAudit('verify_unit', `Verified ${u.stock || u.id}: ${matches} buyer match${matches === 1 ? '' : 'es'}, brochure ${brochureOk ? 'ready' : 'NOT built (missing year/make/model)'}, ${published ? 'published to website' : 'not published'}`);
    return { unit: withDerived(u), matches, brochure: brochureOk, published };
  },

  config: async () => {
    const s = loadState();
    return { ...s.config, stages: STAGES };
  },
  saveConfig: async (b) => {
    const s = loadState();
    Object.assign(s.config, b || {});
    saveState('save_config', s.config);
    recordAudit('update_settings', 'Updated CRM & Team settings');
    return { success: true, ...s.config, stages: STAGES };
  },

  today: async () => {
    const s = loadState();
    const leads = visibleLeadsForUser(s.leads);
    const now = new Date();
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const taskNote = (t, lead) => t.note || (t.auto && lead ? [...(lead.interactions || [])].reverse().find((i) => i.type === 'call')?.note : '') || '';
    const withLead = (t) => { const lead = leads.find((l) => l.id === t.leadId) || null; return { ...t, note: taskNote(t, lead), lead }; };
    const open = [...s.tasks.filter((t) => !t.done), ...listingTasks(s.inventory)];
    const overdue = open.filter((t) => new Date(t.due) < now && !sameDay(new Date(t.due), now)).map(withLead);
    const dueToday = open.filter((t) => sameDay(new Date(t.due), now)).map(withLead);
    const upcoming = open.filter((t) => new Date(t.due) > now && !sameDay(new Date(t.due), now)).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 10).map(withLead);
    const doneToday = s.tasks.filter((t) => t.done && t.doneAt && sameDay(new Date(t.doneAt), now)).length;
    const openLeads = leads.filter((l) => !CLOSED.includes(l.stage));
    const neverCalled = openLeads.filter((l) => !(l.interactions || []).some((i) => i.type === 'call'));
    const hot = openLeads.filter((l) => unitsForLead(l, s.inventory, { limit: 1, min: 85 }).length);
    let play = 'Inbox is clear. Work the hot matches and add fresh inventory.';
    if (overdue.length) play = `Clear ${overdue.length} overdue follow-up${overdue.length > 1 ? 's' : ''} first. They already waited.`;
    else if (hot.length) play = `${hot.length} lead${hot.length > 1 ? 's have' : ' has'} an 85+ match. Pitch them before anything else.`;
    else if (neverCalled.length) play = `${neverCalled.length} lead${neverCalled.length > 1 ? 's have' : ' has'} never been called. Qualify model, hours, budget, timing.`;
    return {
      counts: { overdue: overdue.length, dueToday: dueToday.length, neverCalled: neverCalled.length, hot: hot.length, hotPhone: hot.filter((l) => String(l.phone || '').trim()).length, doneToday, newListings: open.filter((t) => t.kind === 'listing').length },
      overdue, dueToday, upcoming,
      neverCalled: neverCalled.slice(0, 8),
      hot: hot.slice(0, 8).map((l) => ({ ...l, bestMatch: unitsForLead(l, s.inventory, { limit: 1, min: 85 })[0] })).map((l) => ({
        id: l.id, firstName: l.firstName, lastName: l.lastName, company: l.company, score: l.bestMatch.score,
        unit: [l.bestMatch.unit.year, l.bestMatch.unit.make, l.bestMatch.unit.model].join(' '), unitId: l.bestMatch.unit.id,
      })),
      play,
    };
  },

  stats: async () => {
    const s = loadState();
    const leads = visibleLeadsForUser(s.leads);
    const byStage = {};
    for (const st of STAGES) {
      const items = leads.filter((l) => l.stage === st);
      byStage[st] = { count: items.length, value: items.reduce((a, l) => a + (Number(l.budgetMax) || 0), 0) };
    }
    const liveUnits = s.inventory.filter((u) => u.status === 'Live');
    const units = s.inventory.map(withDerived);
    const margins = units.filter((u) => u.margin != null && u.status !== 'Sold');
    const hotUnits = s.inventory.filter((u) => u.status !== 'Sold')
      .map((u) => ({ id: u.id, stock: u.stock, title: [u.year, u.make, u.model].join(' '), status: u.status, buyers: topBuyers(u, leads, { limit: 99, min: 60 }).length, top: topBuyers(u, leads, { limit: 1 })[0]?.score || 0 }))
      .sort((a, b) => b.top - a.top || b.buyers - a.buyers).slice(0, 6);
    return {
      leads: leads.length,
      units: s.inventory.length,
      live: liveUnits.length,
      draft: s.inventory.filter((u) => u.status === 'Draft').length,
      sold: s.inventory.filter((u) => u.status === 'Sold').length,
      liveValue: liveUnits.reduce((a, u) => a + (Number(u.listPrice) || Number(u.askPrice) || 0), 0),
      pipelineValue: leads.filter((l) => !CLOSED.includes(l.stage)).reduce((a, l) => a + (Number(l.budgetMax) || 0), 0),
      potentialMargin: margins.reduce((a, u) => a + u.margin, 0),
      pendingUnits: units.filter((u) => u.pendingFields.length && u.status !== 'Sold').length,
      byStage, hotUnits,
    };
  },

  leads: async (f = {}) => {
    const s = loadState();
    let list = visibleLeadsForUser(s.leads);
    if (f.stage && STAGES.includes(f.stage)) list = list.filter((l) => l.stage === f.stage);
    if (f.q) {
      const q = String(f.q).toLowerCase();
      list = list.filter((l) => [l.firstName, l.lastName, l.email, l.company, l.city, l.phone, l.wants?.model, l.wants?.make, l.ownerName]
        .some((x) => (x || '').toLowerCase().includes(q)));
    }
    return list.map((l) => {
      const best = unitsForLead(l, s.inventory, { limit: 1 })[0];
      return { ...l, bestMatch: best ? { unitId: best.unit.id, title: [best.unit.year, best.unit.make, best.unit.model].join(' '), score: best.score } : null };
    });
  },

  createLead: async (b) => {
    const s = loadState();
    const email = String(b.email || '').trim().toLowerCase();
    const phoneDigits = String(b.phone || '').replace(/\D/g, '');
    const existing = s.leads.find((l) => (email && (l.email || '').toLowerCase() === email) || (!email && phoneDigits.length >= 7 && String(l.phone || '').replace(/\D/g, '') === phoneDigits));
    const me = getCurrentUser() || { id: 1, name: 'James (Admin)' };
    if (existing) {
      Object.assign(existing, b, { wants: { ...(existing.wants || {}), ...(b.wants || {}) } });
      existing.interactions = existing.interactions || [];
      existing.interactions.push({ id: uid(), at: nowIso(), type: 'import', note: 'Merged duplicate lead preferences.' });
      saveState('save_lead', existing);
      recordAudit('lead_merged', `Merged lead ${existing.firstName || ''} ${existing.lastName || ''}`);
      return { lead: existing, created: false, merged: true };
    }
    const lead = {
      id: uid(),
      createdAt: nowIso(),
      stage: b.stage || 'New',
      urgency: b.urgency || 'Medium',
      language: b.language === 'es' ? 'es' : 'en',
      notes: b.notes || '',
      wants: b.wants || {},
      ownerId: b.ownerId || me.id,
      ownerName: b.ownerName || me.name,
      interactions: [{ id: uid(), at: nowIso(), type: 'import', note: 'Created in BAM CRM.' }],
      ...b,
    };
    s.leads.unshift(lead);
    saveState('save_lead', lead);
    recordAudit('lead_created', `Created lead ${lead.firstName || ''} ${lead.lastName || ''} (${lead.company || ''})`);
    return { lead, created: true, merged: false };
  },

  updateLead: async (id, b) => {
    const s = loadState();
    const l = s.leads.find((x) => String(x.id) === String(id));
    if (!l) throw new Error('Lead not found');
    const prevStage = l.stage;
    const { wants, ...rest } = b;
    Object.assign(l, rest);
    if (wants) l.wants = { ...(l.wants || {}), ...wants };
    if (b.stage && b.stage !== prevStage) {
      l.interactions = l.interactions || [];
      l.interactions.push({ id: uid(), at: nowIso(), type: 'stage', note: `Stage: ${prevStage} → ${b.stage}` });
    }
    saveState('save_lead', l);
    recordAudit('lead_updated', `Updated lead ${l.firstName || ''} ${l.lastName || ''} (Stage: ${l.stage})`);
    return l;
  },

  deleteLead: async (id) => {
    const s = loadState();
    const i = s.leads.findIndex((x) => String(x.id) === String(id));
    if (i === -1) throw new Error('Lead not found');
    const [gone] = s.leads.splice(i, 1);
    s.tasks = s.tasks.filter((t) => String(t.leadId) !== String(gone.id));
    s.matches = s.matches.filter((m) => String(m.leadId) !== String(gone.id));
    saveState('delete_lead', { id: gone.id });
    recordAudit('lead_deleted', `Deleted lead ${gone.firstName || ''} ${gone.lastName || ''}`);
    return gone;
  },

  importLeads: async (b) => {
    let records = b.leads;
    if (!records && typeof b.csv === 'string') {
      const lines = b.csv.split(/\r?\n/).filter((x) => x.trim());
      if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row');
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
      records = lines.slice(1).map((line) => {
        const cols = line.split(',');
        const o = { wants: {} };
        headers.forEach((h, idx) => {
          const v = (cols[idx] || '').trim();
          if (!v) return;
          if (['make', 'model', 'category'].includes(h)) o.wants[h] = v;
          else if (h === 'first_name' || h === 'firstname') o.firstName = v;
          else if (h === 'last_name' || h === 'lastname') o.lastName = v;
          else if (h === 'budget' || h === 'budget_max') o.budgetMax = Number(v.replace(/\D/g, ''));
          else o[h] = v;
        });
        return o;
      });
    }
    const res = { created: 0, merged: 0, skipped: [] };
    for (let i = 0; i < (records || []).length; i++) {
      try {
        const r = await localApi.createLead(records[i]);
        res[r.created ? 'created' : 'merged']++;
      } catch (e) {
        res.skipped.push({ row: i + 1, reason: e.message });
      }
    }
    return res;
  },

  logCall: async (id, note) => {
    const s = loadState();
    const l = s.leads.find((x) => String(x.id) === String(id));
    if (!l) throw new Error('Lead not found');
    const cleanNote = String(note || '').trim();
    if (!cleanNote) throw new Error('A call note is required');
    if (detectSpanish(cleanNote)) l.language = 'es';
    l.interactions = l.interactions || [];
    l.interactions.push({ id: uid(), at: nowIso(), type: 'call', note: cleanNote });
    if (l.stage === 'New') l.stage = 'Contacted';
    const due = nextWeekdayAt10();
    const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company;
    const task = { id: uid(), title: `Follow up: ${name}`, leadId: l.id, due: due.toISOString(), done: false, priority: l.urgency === 'High' ? 'high' : 'normal', auto: true, note: cleanNote };
    s.tasks.push(task);
    saveState('log_call', { leadId: l.id, note: cleanNote, task });
    recordAudit('call_logged', `Call logged with ${name} (${l.language.toUpperCase()})`);
    return { lead: l, task, language: l.language, draft: followUpDraft(l, cleanNote, s.config) };
  },

  logTouch: async (id, b) => {
    const s = loadState();
    const l = s.leads.find((x) => String(x.id) === String(id));
    if (!l) throw new Error('Lead not found');
    const type = ['text', 'email', 'brochure', 'note'].includes(b.type) ? b.type : 'note';
    l.interactions = l.interactions || [];
    l.interactions.push({ id: uid(), at: nowIso(), type, note: String(b.note || '').trim(), unitId: b.unitId });
    if (b.unitId && type !== 'note') {
      let m = s.matches.find((x) => String(x.leadId) === String(l.id) && String(x.unitId) === String(b.unitId));
      if (!m) s.matches.push((m = { leadId: l.id, unitId: b.unitId }));
      m.status = 'pitched';
      m.at = nowIso();
    }
    saveState('log_touch', { leadId: l.id, ...b });
    recordAudit('lead_touch', `Logged ${type} for ${l.firstName || ''} ${l.lastName || ''}`);
    return l;
  },

  leadMatches: async (id) => {
    const s = loadState();
    const l = s.leads.find((x) => String(x.id) === String(id));
    if (!l) throw new Error('Lead not found');
    return unitsForLead(l, s.inventory, { limit: 8 }).map((m) => ({ ...m, unit: withDerived(m.unit) }));
  },

  inventory: async (f = {}) => {
    const s = loadState();
    let list = s.inventory;
    if (f.status && UNIT_STATUSES.includes(f.status)) list = list.filter((u) => u.status === f.status);
    if (f.q) {
      const q = String(f.q).toLowerCase();
      list = list.filter((u) => [u.stock, u.year, u.make, u.model, u.category, u.serial, u.city, u.state].some((x) => String(x ?? '').toLowerCase().includes(q)));
    }
    const leads = visibleLeadsForUser(s.leads);
    return list.map((u) => {
      const tops = topBuyers(u, leads, { limit: 3 });
      return { ...withDerived(u), topScore: tops[0]?.score ?? 0, buyerCount: topBuyers(u, leads, { limit: 99 }).length };
    });
  },

  createUnit: async (b) => {
    const s = loadState();
    const nums = s.inventory.map((u) => Number(String(u.stock || '').replace(/\D/g, '')) || 0);
    const nextStock = 'BAM-' + (Math.max(1000, ...nums) + 1);
    const unit = {
      id: uid(),
      createdAt: nowIso(),
      status: b.status || 'Draft',
      media: Array.isArray(b.media) ? b.media : String(b.media || '').split('\n').map((x) => x.trim()).filter(Boolean),
      oemSpecs: b.oemSpecs || {},
      sellerStatus: b.sellerStatus || '',
      verified: b.status === 'Live',
      ...b,
      stock: b.stock || nextStock,
    };
    unit.media = Array.isArray(b.media) ? b.media : String(b.media || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
    if (unit.model) unit.model = fmtModel(unit.model);
    s.inventory.unshift(unit);
    saveState('save_unit', unit);
    if (unit.media.length && s.config?.features?.['ingest-photostore'] !== false) cacheUnitPhotos(unit.id, unit.media);
    recordAudit('unit_created', `Added unit ${unit.stock} (${unitTitle(unit)})`);
    return withDerived(unit);
  },

  updateUnit: async (id, b) => {
    const s = loadState();
    const u = s.inventory.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Unit not found');
    if (b.media !== undefined && !Array.isArray(b.media)) {
      b.media = String(b.media || '').split('\n').map((x) => x.trim()).filter(Boolean);
    }
    const mediaChanged = b.media !== undefined && JSON.stringify(b.media) !== JSON.stringify(u.media);
    Object.assign(u, b);
    if (u.model) u.model = fmtModel(u.model);
    saveState('save_unit', u);
    if (mediaChanged && u.media.length && s.config?.features?.['ingest-photostore'] !== false) cacheUnitPhotos(u.id, u.media);
    recordAudit('unit_updated', `Updated unit ${u.stock} (${unitTitle(u)}) — Status: ${u.status}`);
    return withDerived(u);
  },

  deleteUnit: async (id) => {
    const s = loadState();
    const i = s.inventory.findIndex((x) => String(x.id) === String(id));
    if (i === -1) throw new Error('Unit not found');
    const [gone] = s.inventory.splice(i, 1);
    s.matches = s.matches.filter((m) => String(m.unitId) !== String(gone.id));
    saveState('delete_unit', { id: gone.id });
    recordAudit('unit_deleted', `Deleted unit ${gone.stock}`);
    return gone;
  },

  unitMatches: async (id, min = 40) => {
    const s = loadState();
    const u = s.inventory.find((x) => String(x.id) === String(id));
    if (!u) throw new Error('Unit not found');
    const leads = visibleLeadsForUser(s.leads);
    return topBuyers(u, leads, { limit: 10, min: Number(min) || 40 }).map((m) => {
      const rec = s.matches.find((x) => String(x.leadId) === String(m.lead.id) && String(x.unitId) === String(u.id));
      return {
        ...m,
        status: rec?.status || 'new',
        pitch: draftPitch(m.lead, u, s.config),
        pitches: {
          en: draftPitch({ ...m.lead, language: 'en' }, u, s.config),
          es: draftPitch({ ...m.lead, language: 'es' }, u, s.config),
        },
      };
    });
  },

  brochureUrl: (id) => `#brochure-${id}`,

  matchStatus: async ({ leadId, unitId, status }) => {
    const s = loadState();
    let m = s.matches.find((x) => String(x.leadId) === String(leadId) && String(x.unitId) === String(unitId));
    if (!m) s.matches.push((m = { leadId, unitId }));
    m.status = status;
    m.at = nowIso();
    saveState('match_status', m);
    recordAudit('match_status', `Marked match (${unitId} → ${leadId}) as ${status}`);
    return m;
  },

  // Zero-API Bulk Pitch -> Saves buyer-safe drafts directly into the MySQL `email_drafts` table (no external API needed)
  bulkPitch: async ({ unitId, leadIds }) => {
    const s = loadState();
    const unit = s.inventory.find((u) => String(u.id) === String(unitId));
    if (!unit) throw new Error('Unit not found');
    const results = [];
    for (const lid of leadIds || []) {
      const lead = s.leads.find((l) => String(l.id) === String(lid));
      if (!lead || !lead.email) {
        results.push({ leadId: lid, name: lead ? `${lead.firstName} ${lead.lastName}` : 'Buyer', ok: false, reason: 'No email on file' });
        continue;
      }
      const pitch = draftPitch(lead, unit, s.config);
      const draftId = (s.email_drafts[0]?.id || 100) + results.length + 1;
      const draftRow = {
        id: draftId,
        kind: 'unit_match',
        inventory_id: unit.id,
        lead_id: lead.id,
        to_email: lead.email,
        to_name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company,
        subject: pitch.subject,
        body: pitch.body,
        status: 'Draft',
        created_at: nowIso(),
      };
      s.email_drafts.unshift(draftRow);
      lead.interactions = lead.interactions || [];
      lead.interactions.push({ id: uid(), at: nowIso(), type: 'email', note: `Saved pitch + 2-page brochure to MySQL email_drafts (#${draftId})`, unitId: unit.id });
      let m = s.matches.find((x) => String(x.leadId) === String(lead.id) && String(x.unitId) === String(unit.id));
      if (!m) s.matches.push((m = { leadId: lead.id, unitId: unit.id }));
      m.status = 'drafted';
      m.at = nowIso();
      results.push({
        leadId: lid,
        name: draftRow.to_name,
        email: lead.email,
        ok: true,
        draftId: String(draftId),
        composeUrl: `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(pitch.subject)}&body=${encodeURIComponent(pitch.body)}`,
        attachment: `${unit.stock || 'BAM'}_2Page_Brochure.pdf`,
      });
    }
    saveState('bulk_pitch', { unitId, results });
    recordAudit('bulk_pitch_drafts', `Created ${results.filter((r) => r.ok).length} email_drafts rows for ${unit.stock}`);
    return { sender: s.config.email || 'sales@bigassmotors.com', created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  },

  googleStatus: async () => {
    const s = loadState();
    return { configured: true, connected: true, sender: s.config.email || 'sales@bigassmotors.com', email: s.config.email || 'sales@bigassmotors.com', mode: 'mysql_email_drafts' };
  },
  googleDisconnect: async () => ({ configured: true, connected: true }),

  parseListing: async ({ text, url, images = [] }) => {
    const s = loadState();
    const r = parseListingText(text, url);
    const combined = [...new Set([...(Array.isArray(images) ? images : []), ...(r.fields.media || [])])].filter((u) => /^https?:\/\//i.test(u)).slice(0, 24);
    r.fields.media = combined;
    const dup = r.fields.serial && s.inventory.find((u) => u.serial && u.serial === r.fields.serial);
    const probe = { ...r.fields, oemSpecs: r.oemSpecs, status: 'Draft', thirdParty: true };
    return {
      ...r,
      duplicateOf: dup ? { id: dup.id, stock: dup.stock } : null,
      preview: topBuyers(probe, s.leads, { limit: 3 }).map((m) => ({
        id: m.lead.id,
        name: [m.lead.firstName, m.lead.lastName].filter(Boolean).join(' '),
        company: m.lead.company,
        score: m.score,
      })),
    };
  },

  pullListing: async (url) => {
    // Zero-API: if on Hostinger PHP, use PHP server-side fetch; otherwise parse URL slug tokens or prompt BAM Grabber bookmarklet
    const slugText = String(url || '').replace(/[/_-]+/g, ' ');
    const parsed = await localApi.parseListing({ text: slugText, url });
    if (!parsed.fields.make && !parsed.fields.model) {
      throw new Error('Zero-API Mode: Paste the listing text below or click the BAM Grabber bookmarklet on the listing tab.');
    }
    return parsed;
  },

  tasks: async () => {
    const s = loadState();
    return [
      ...s.tasks.map((t) => {
        const lead = s.leads.find((l) => String(l.id) === String(t.leadId)) || null;
        return { ...t, lead };
      }),
      ...listingTasks(s.inventory),
    ].sort((a, b) => new Date(a.due) - new Date(b.due));
  },
  createTask: async (b) => {
    const s = loadState();
    const t = { id: uid(), title: String(b.title || '').trim(), leadId: b.leadId || null, due: (b.due ? new Date(b.due) : nextWeekdayAt10()).toISOString(), done: false, priority: b.priority === 'high' ? 'high' : 'normal' };
    s.tasks.push(t);
    saveState('save_task', t);
    recordAudit('task_created', `Created task: ${t.title}`);
    return t;
  },
  updateTask: async (id, b) => {
    const s = loadState();
    if (String(id).startsWith('listing-')) {
      // A listing task is derived from the machine: ticking it marks the listing as reviewed.
      const u = s.inventory.find((x) => `listing-${x.id}` === String(id));
      if (!u) throw new Error('Task not found');
      u.listingReviewed = !!b.done;
      saveState('save_unit', u);
      return { id, done: !!b.done };
    }
    const t = s.tasks.find((x) => String(x.id) === String(id));
    if (!t) throw new Error('Task not found');
    if (b.done !== undefined) { t.done = !!b.done; t.doneAt = t.done ? nowIso() : undefined; }
    if (b.due) t.due = new Date(b.due).toISOString();
    if (b.title) t.title = String(b.title).trim();
    saveState('save_task', t);
    return t;
  },
  deleteTask: async (id) => {
    const s = loadState();
    if (String(id).startsWith('listing-')) {
      const u = s.inventory.find((x) => `listing-${x.id}` === String(id));
      if (u) { u.listingReviewed = true; saveState('save_unit', u); }
      return { ok: true };
    }
    s.tasks = s.tasks.filter((x) => String(x.id) !== String(id));
    saveState('delete_task', { id });
    return { ok: true };
  },

  // ---------------- Hostinger Multi-User / MySQL PDO Tables (`users`, `email_drafts`, `crm_audit`, `tw_assign`) ----------------
  users: async () => loadState().users || [],
  saveUser: async (u) => {
    const s = loadState();
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) throw new Error('E-mail is required');
    let existing = s.users.find((x) => Number(x.id) === Number(u.id) || x.email.toLowerCase() === email);
    if (existing) {
      Object.assign(existing, {
        name: u.name ?? existing.name,
        email,
        role: ['admin', 'sales', 'broker'].includes(u.role) ? u.role : existing.role,
        active: u.active !== undefined ? (u.active ? 1 : 0) : existing.active,
        google_allowed: u.google_allowed !== undefined ? (u.google_allowed ? 1 : 0) : existing.google_allowed,
      });
      if (u.password) Object.assign(existing, await makePasswordFields(u.password));
    } else {
      existing = {
        id: Math.max(0, ...s.users.map((x) => Number(x.id) || 0)) + 1,
        email,
        name: u.name || email.split('@')[0],
        role: ['admin', 'sales', 'broker'].includes(u.role) ? u.role : 'sales',
        active: 1,
        google_allowed: u.google_allowed ? 1 : 0,
        ...(u.password ? await makePasswordFields(u.password) : {}),
        last_login_at: null,
        last_login_via: null,
      };
      s.users.push(existing);
    }
    saveState('save_user', publicUser(existing));
    recordAudit('user_saved', `Updated user ${existing.email} (Role: ${existing.role}, Google Access List: ${existing.google_allowed ? 'Yes' : 'No'})`, '/inventory/users.php');
    return existing;
  },
  deleteUser: async (id) => {
    const s = loadState();
    const idx = (s.users || []).findIndex((x) => Number(x.id) === Number(id));
    if (idx === -1) throw new Error('User not found');
    const [gone] = s.users.splice(idx, 1);
    saveState('delete_user', { id: gone.id, email: gone.email });
    recordAudit('user_deleted', `Deleted user ${gone.name} (${gone.email})`, '/inventory/users.php');
    return gone;
  },
  assignLeadOwner: async (leadId, userId) => {
    const s = loadState();
    const lead = s.leads.find((l) => String(l.id) === String(leadId));
    const user = s.users.find((u) => Number(u.id) === Number(userId));
    if (!lead || !user) throw new Error('Lead or user not found');
    lead.ownerId = user.id;
    lead.ownerName = user.name;
    saveState('assign_lead', { leadId: lead.id, userId: user.id });
    recordAudit('tw_assign', `Assigned lead ${lead.firstName} ${lead.lastName} to ${user.name}`, '/inventory/team_settings.php');
    return lead;
  },
  emailDrafts: async () => loadState().email_drafts || [],
  updateEmailDraft: async (id, status) => {
    const s = loadState();
    const d = (s.email_drafts || []).find((x) => Number(x.id) === Number(id));
    if (!d) throw new Error('Draft not found');
    d.status = status;
    saveState('update_draft', { id, status });
    recordAudit('email_draft_status', `Marked email_draft #${id} (${d.to_email}) as ${status}`, '/inventory/outbox.php');
    return d;
  },
  auditLog: async () => loadState().crm_audit || [],
};
