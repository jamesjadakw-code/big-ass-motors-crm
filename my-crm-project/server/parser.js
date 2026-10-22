// Heuristic listing parser. Never guesses: anything not found stays unset and is
// listed in `pending` so it can be marked "Pending Inspection".
const MAKES = ['Vermeer', 'Ditch Witch', 'Caterpillar', 'CAT', 'John Deere', 'Case', 'Komatsu', 'Kubota',
  'Bobcat', 'Hitachi', 'Volvo', 'JCB', 'Astec', 'Toro', 'American Augers', 'Barbco', 'Trencor', 'Takeuchi',
  'Gradall', 'Altec', 'Terex', 'Hyundai', 'Doosan', 'Kobelco', 'Liebherr', 'Sullair'];

const CATEGORIES = [
  [/\b(hdd|directional|horizontal drill|drill rig)\b|\bD\d{2}x\d{2}\b/i, 'HDD Drill'],
  [/\b(vacuum|hydrovac|vac ?ex)/i, 'Vacuum Excavator'],
  [/\b(rock ?saw)\b/i, 'Rock Saw'],
  [/\b(trencher|trenching|plow)\b|\bRTX?\d{3,4}/i, 'Trencher'],
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

// Seed OEM benchmarks. APPROXIMATE reference values only. Drop a server/oem-specs.json
// (same shape) to correct or extend. Enriched values are never treated as verified.
const OEM_SEED = [
  { match: 'rtx1250', engine: 'Cummins QSB4.5', hp: 130 },
  { match: 'rt125', hp: 125 },
  { match: 'rt115', hp: 115 },
];
function oemTable() {
  try { return require('./oem-specs.json'); } catch { return OEM_SEED; }
}

// Scraped pages carry CSS, nav and feed junk. Strip it before parsing.
function cleanListingText(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/(?:@media[^{]*)?[.#][\w-]+(?:\s*[.#:>][\w-]+)*\s*\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

function parseListing(text, url = '') {
  const t = cleanListingText(text);
  const f = {};

  const year = t.match(/\b(19[89]\d|20[0-3]\d)\b/);
  if (year) f.year = Number(year[1]);

  const make = MAKES.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(t));
  if (make) f.make = make === 'CAT' ? 'Caterpillar' : make;

  if (make) {
    const after = t.split(new RegExp(`\\b${make}\\b`, 'i'))[1] || '';
    const model = after.trim().match(/^([A-Za-z]{0,4}-?\d[\w\-./]*(?:\s(?:Quad|S3|Series|II|XL|LGP|AWD|M3))?)/);
    if (model) f.model = model[1].replace(/[.,]$/, '').trim();
  }

  for (const [re, cat] of CATEGORIES) {
    if (re.test(t)) { f.category = cat; break; }
  }

  const hours = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:hours|hrs|hr)\b/i);
  if (hours) f.hours = Number(hours[1].replace(/,/g, ''));

  const price = t.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d{4,7})/);
  if (price) f.askPrice = Number(price[1].replace(/,/g, ''));

  // The value must contain a digit, so "serial number available upon inspection" never yields "INSPECTION".
  const serial = t.match(/\b(?:serial(?: number| no\.?| #)?|s\/n|vin|pin)\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,})/i);
  if (serial) f.serial = serial[1].toUpperCase();

  const loc = t.match(/\b(?:listed in|located in|location:?|in)\s+([A-Z][A-Za-z.\s]{2,25}),\s*([A-Z]{2})\b/);
  if (loc) { f.city = loc[1].trim(); f.state = loc[2]; }

  const defects = DEFECT_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));
  if (defects.length) f.knownDefects = defects.join(', ');

  if (/fully serviced|recent(ly)? serviced|service records/i.test(t)) {
    f.serviceHistory = 'Seller states: serviced (records not verified)';
  }

  const oemSpecs = {};
  if (f.model) {
    const key = f.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = oemTable().find((o) => key.includes(o.match));
    if (hit) {
      const { match, ...specs } = hit;
      Object.assign(oemSpecs, specs);
    }
  }

  const pending = ['year', 'make', 'model', 'serial', 'hours'].filter((k) => f[k] == null);
  for (const k of ['hp', 'weight', 'dimensions']) if (f[k] == null && oemSpecs[k] == null) pending.push(k);

  if (url) f.sourceUrl = url;
  return { fields: f, oemSpecs, pending };
}

module.exports = { parseListing, cleanListingText };
