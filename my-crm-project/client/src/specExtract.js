// Deterministic Spec Extractor for Big Ass Motors (BAM)
// Extracts operating weight, transport dimensions, horsepower, engine models,
// drill performance metrics (pullback, torque, mud flow, pipe), trencher metrics (depth, width, boom, chain),
// undercarriage, and subsystems (mixing systems, trailers) strictly when stated in listing text.
// Missing fields remain unset (never guessed).

const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d{4,6}|\\d{1,3}(?:\\.\\d+)?)';
const UNIT = '(lbs?\\.?|pounds?|kgs?|kilograms?|tons?|tonnes?)';
const SEP = '\\s*(?:is|of|:|-|=|approx\\.?|approximately|about|around)?\\s*';

function fmtWeight(num, unit) {
  const kind = /^(?:kg|kilogram)/i.test(unit) ? 'kg' : /^tonne/i.test(unit) ? 'tonnes' : /^ton/i.test(unit) ? 'tons' : 'lbs';
  const v = Number(String(num).replace(/,/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (kind === 'lbs' && (v < 500 || v > 400000)) return null;
  if (kind === 'kg' && (v < 250 || v > 180000)) return null;
  if ((kind === 'tons' || kind === 'tonnes') && (v < 0.5 || v > 200)) return null;
  return `${kind === 'lbs' || kind === 'kg' ? v.toLocaleString('en-US') : String(num)} ${kind}`;
}

const PART_WORDS = /\b(?:buckets?|thumbs?|blades?|forks?|attachments?|counterweights?|chains?|teeth|rods?|pipes?|augers?|rippers?|hammers?|breakers?|tires?|tracks?)\b[^.]{0,30}$/i;

export function extractWeight(text) {
  const s = String(text || '');
  const tries = [
    [new RegExp(`\\boperating\\s+weights?${SEP}${NUM}\\s*${UNIT}`, 'i'), 0],
    [new RegExp(`${NUM}\\s*${UNIT}\\s*operating\\s+weight`, 'i'), 0],
    [new RegExp(`\\b(?:machine|shipping|transport|unit|gross|total)\\s+weights?${SEP}${NUM}\\s*${UNIT}`, 'i'), 2000],
    [new RegExp(`\\bweigh(?:s|ing)\\s*(?:in at|about|around|approx\\.?|approximately)?\\s*${NUM}\\s*${UNIT}`, 'i'), 2000],
    [new RegExp(`\\bweight\\s*(?:is|of|:|-|=|approx\\.?|approximately|about|around)\\s*${NUM}\\s*${UNIT}`, 'i'), 2000],
  ];
  for (const [re, minLbs] of tries) {
    const m = s.match(re);
    if (!m) continue;
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    if (PART_WORDS.test(before)) continue;
    const w = fmtWeight(m[1], m[2]);
    if (!w) continue;
    const v = Number(w.split(' ')[0].replace(/,/g, ''));
    if (minLbs && /lbs$/.test(w) && v < minLbs) continue;
    return w;
  }
  return null;
}

const D_UNIT = '(ft\\.?|feet|foot|\'|in\\.?|inches|")';
const D_NUM = '\\d{1,3}(?:\\.\\d+)?';
const D_OPT = `(?:\\s*(?:ft\\.?|feet|foot|'|in\\.?|inches|"))?`;
const unitName = (u) => (/^(?:ft|feet|foot|')/i.test(u) ? 'ft' : 'in');

export function extractDimensions(text) {
  const s = String(text || '').replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  const got = {};
  for (const [k, word] of [['L', 'length'], ['W', 'width'], ['H', 'height']]) {
    const m = s.match(new RegExp(`\\b(?:overall\\s+|transport\\s+)?${word}\\s*[:=-]?\\s*(${D_NUM})\\s*${D_UNIT}`, 'i'));
    if (m) got[k] = `${m[1]} ${unitName(m[2])}`;
  }
  if (got.L && got.W && got.H) return `${got.L} L x ${got.W} W x ${got.H} H`;
  const m = s.match(new RegExp(`(${D_NUM})${D_OPT}\\s*[x×X]\\s*(${D_NUM})${D_OPT}\\s*[x×X]\\s*(${D_NUM})${D_OPT}`));
  if (m) {
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    const looksLikeSize = /(dimensions?|size|l\s*x\s*w\s*x\s*h|transport|overall|length)\s*[:=-]?\s*$/i.test(before) || /(?:ft|feet|'|in|inches|")/i.test(m[0]);
    if (looksLikeSize) return m[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

// ---------------- Engine & Power Extraction ----------------
export function extractEngine(text) {
  const s = String(text || '');
  const engineRegexes = [
    /\b(?:engine|motor)[:\s-]*([A-Za-z0-9.\- ]{3,35}\b(?:Diesel|Turbo|Tier\s*\d|ACERT|QSB|TCD)?)/i,
    /\b(Cummins\s+(?:QSB[\w.]+|B3\.3|B4\.5|4BT|6BT|[\w.-]+))/i,
    /\b(Deutz\s+(?:TCD[\w.]+|TD[\w.]+|BF4M[\w.]+|[\w.-]+))/i,
    /\b(Cat(?:erpillar)?\s+(?:C[\d.]+|[\d]{3}[A-Z]?|ACERT[\w.-]*))/i,
    /\b(John\s+Deere\s+(?:4045[\w.]*|6068[\w.]*|PowerTech[\w.-]*))/i,
    /\b(Kubota\s+(?:V[\d.]+[\w-]*|[\w.-]+))/i,
    /\b(Yanmar\s+[\w.-]+)/i,
    /\b(Kohler\s+[\w.-]+)/i,
  ];
  for (const re of engineRegexes) {
    const m = s.match(re);
    if (m && m[1]) {
      const clean = m[1].replace(/\b(?:engine|motor|hours?|hrs)\b/gi, '').trim();
      if (clean.length >= 3 && clean.length <= 40) return clean;
    }
  }
  return null;
}

export function extractHp(text) {
  const s = String(text || '');
  const m = s.match(/\b(\d{2,4})\s*(?:hp|horsepower|gross\s*hp|net\s*hp|bhp)\b/i);
  if (m) {
    const val = Number(m[1]);
    if (val >= 15 && val <= 2500) return val;
  }
  return null;
}

// ---------------- Horizontal Directional Drill (HDD) Performance Specs ----------------
export function extractDrillSpecs(text) {
  const s = String(text || '');
  const specs = {};

  // Pullback & Thrust (e.g. 20,000 lbs pullback, 20k lbs, 24,000 lbf)
  const pbMatch = s.match(/(\d{1,3}(?:,\d{3})+|\d{2,3}(?:k)?|\d{4,6})\s*(?:lbs?|lbf)?\s*(?:pullback|pull\s*back|thrust)/i) ||
                  s.match(/(?:pullback|thrust|pull\s*back)[:\s]*(\d{1,3}(?:,\d{3})+|\d{2,3}k|\d{4,6})\s*(?:lbs?|lbf)?/i);
  if (pbMatch) {
    let raw = pbMatch[1].replace(/k/i, ',000').replace(/,/g, '');
    const num = Number(raw);
    if (num >= 5000 && num <= 1000000) {
      specs.pullback = `${num.toLocaleString('en-US')} lbs`;
      specs.thrust = `${num.toLocaleString('en-US')} lbs`;
    }
  }

  // Rotational Torque (e.g. 2,200 ft-lbs, 4000 ft-lb torque)
  const torqMatch = s.match(/(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:ft[·\-\s]?lbs?|ft\s*lbs?)(?:\s*(?:rotational\s*)?torque)?/i) ||
                    s.match(/(?:rotational\s*torque|torque)[:\s]*(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:ft[·\-\s]?lbs?|ft\s*lbs?)?/i);
  if (torqMatch) {
    const num = Number(torqMatch[1].replace(/,/g, ''));
    if (num >= 300 && num <= 100000) {
      specs.torque = `${num.toLocaleString('en-US')} ft-lbs`;
    }
  }

  // Mud Pump / Flow (e.g. 25 gpm @ 750 psi, 35 gpm mud pump)
  const mudMatch = s.match(/(\d{1,3})\s*(?:gpm|gallons?\s+per\s+minute)(?:\s*@\s*(\d{2,4})\s*psi)?/i) ||
                   s.match(/(?:mud\s*pump|drilling\s*fluid\s*pump|fluid\s*flow)[:\s]*(\d{1,3})\s*gpm/i);
  if (mudMatch) {
    const gpm = mudMatch[1];
    const psi = mudMatch[2] ? ` @ ${mudMatch[2]} PSI` : '';
    specs.mudPump = `${gpm} GPM${psi}`;
  }

  // Spindle Speed / RPM
  const rpmMatch = s.match(/(\d{2,4})\s*(?:rpm|spindle\s*rpm)\b/i) ||
                   s.match(/(?:spindle\s*speed|max\s*spindle)[:\s]*(\d{2,4})\s*rpm/i);
  if (rpmMatch) {
    specs.spindleSpeed = `${rpmMatch[1]} RPM`;
  }

  // Drill Pipe / Rods Capacity (e.g. 400 ft of pipe, 40 rods included, 2.06 Firestick)
  const pipeMatch = s.match(/(\d{2,4})\s*(?:ft|feet|')\s*(?:of\s*)?(?:[0-9.]+\"?\s*)?(?:drill\s*pipe|firestick|rods?)/i) ||
                    s.match(/(\d{1,3})\s*(?:drill\s*)?rods?\b/i);
  if (pipeMatch) {
    specs.pipeCapacity = pipeMatch[0].trim();
  }

  return specs;
}

// ---------------- Trencher & Rock Saw Performance Specs ----------------
export function extractTrencherSpecs(text) {
  const s = String(text || '');
  const specs = {};

  // Digging Depth (e.g. 60" depth, 5 ft boom, 72-inch digging depth)
  const depthMatch = s.match(/(?:digging\s+depth|depth|boom\s*depth)[:\s]*(\d{1,2}(?:\.\d+)?)\s*(?:ft|feet|'|in|inches|")/i) ||
                     s.match(/(\d{1,2})\s*(?:ft|foot|')\s*(?:boom|trencher\s*boom)/i) ||
                     s.match(/(\d{2,3})\s*(?:in|inch|inches|")\s*(?:depth|boom|trench\s*depth)/i);
  if (depthMatch) {
    specs.digDepth = depthMatch[0].trim();
  }

  // Trench Width (e.g. 8" width, 6 to 12 inch chain)
  const widthMatch = s.match(/(?:trench\s*width|cut\s*width|chain\s*width)[:\s]*(\d{1,2}(?:\s*-\s*\d{1,2})?)\s*(?:in|inches|")/i) ||
                     s.match(/(\d{1,2})\s*(?:in|inch|inches|")\s*(?:chain|cut|width)/i);
  if (widthMatch) {
    specs.cutWidth = widthMatch[0].trim();
  }

  // Chain Type / Teeth
  const chainMatch = s.match(/\b(rock\s*chain|shark\s*chain|cup\s*chain|alligator\s*chain|combo\s*chain|carbide\s*teeth|bullet\s*teeth)\b/i);
  if (chainMatch) {
    specs.chainType = chainMatch[1];
  }

  // Plow Attachment
  const plowMatch = s.match(/\b(vibratory\s*plow|vp\d{2,3}|plow\s*blade|reel\s*carrier|chute)\b/i);
  if (plowMatch) {
    specs.plow = plowMatch[0];
  }

  // Backfill Blade
  const bladeMatch = s.match(/\b(backfill\s*blade|6-way\s*blade|hydraulic\s*blade|dozer\s*blade)\b/i);
  if (bladeMatch) {
    specs.blade = bladeMatch[0];
  }

  return specs;
}

// ---------------- Subsystems & Support Packages ----------------
export function extractSubsystems(text) {
  const s = String(text || '');
  const sub = {};

  // Mud Mixing System (e.g. 500-gallon mixing system, FM13V, MX125, Vermeer 500 gal mixer)
  const mudSysMatch = s.match(/\b((?:ditch\s*witch|vermeer|kem-tron)?\s*(?:fm\d+|mx\d+|[\d]{3,4}\s*gal(?:lon)?)\s*(?:mixing\s*system|mixer|mixing\s*station|mud\s*system))\b/i) ||
                      s.match(/\b(\d{3,4}\s*gal(?:lon)?\s*(?:tank|mixer|mud\s*system))\b/i);
  if (mudSysMatch) {
    sub.mudSystem = mudSysMatch[0].trim();
  }

  // Equipment Trailer (e.g. CAM Superline tilt, Felling FT-24, Lonestar trailer, tandem 24k GVWR)
  const trailerMatch = s.match(/\b((?:cam\s*superline|felling|lonestar|bwise|trail\s*king|redi-haul|towmaster)?\s*(?:tilt[\w\s-]*|gooseneck|tagalong|tandem|equipment|tri-axle)?\s*trailer(?:\s*with\s*[\w\s]+)?)\b/i) ||
                       s.match(/\b(\d{2,3},\d{3}\s*gvwr\s*trailer)\b/i);
  if (trailerMatch) {
    sub.trailer = trailerMatch[0].trim();
  }

  // Electronics / Locators (e.g. Subsite Marksman, Digitrak Falcon F2, 86BH sonde)
  const locMatch = s.match(/\b((?:subsite|digitrak|dci)\s*(?:marksman|falcon\s*f\d+|f\d+|tk\w*|750|850)?(?:\s*locator|\s*receiver|\s*system|\s*sonde)?)\b/i);
  if (locMatch) {
    sub.locator = locMatch[0].trim();
  }

  return sub;
}

// ---------------- Undercarriage & Tracks ----------------
export function extractUndercarriage(text) {
  const s = String(text || '');
  const m = s.match(/\b(quad\s*tracks?|rubber\s*tracks?|steel\s*tracks?|rubber\s*tires?)\b/i);
  if (m) return m[1];
  const pct = s.match(/(\d{1,2}|100)%\s*(?:remaining|undercarriage|tires|tracks)\b/i);
  if (pct) return `${pct[1]}% remaining`;
  return null;
}

// ---------------- Unified Comprehensive Extractor ----------------
export function extractFullSpecSheet(text, categoryHint = '', makeHint = '', modelHint = '') {
  const s = String(text || '');
  const specs = {};

  const eng = extractEngine(s);
  if (eng) specs.engine = eng;

  const hp = extractHp(s);
  if (hp) specs.hp = hp;

  const wt = extractWeight(s);
  if (wt) specs.weight = wt;

  const dm = extractDimensions(s);
  if (dm) specs.dimensions = dm;

  const uc = extractUndercarriage(s);
  if (uc) specs.undercarriage = uc;

  const drill = extractDrillSpecs(s);
  Object.assign(specs, drill);

  const trencher = extractTrencherSpecs(s);
  Object.assign(specs, trencher);

  const subs = extractSubsystems(s);
  if (Object.keys(subs).length) specs.subsystems = subs;

  return specs;
}
