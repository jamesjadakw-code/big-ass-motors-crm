// Operating weight and transport dimensions, read ONLY when a listing states them. Nothing is estimated here:
// no match means null, and the app leaves the spec out entirely (no row, no name, no placeholder).

const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d{4,6}|\\d{1,3}(?:\\.\\d+)?)';
const UNIT = '(lbs?\\.?|pounds?|kgs?|kilograms?|tons?|tonnes?)';
const SEP = '\\s*(?:is|of|:|-|=|approx\\.?|approximately|about|around)?\\s*';

function fmtWeight(num, unit) {
  const kind = /^(?:kg|kilogram)/i.test(unit) ? 'kg' : /^tonne/i.test(unit) ? 'tonnes' : /^ton/i.test(unit) ? 'tons' : 'lbs';
  const v = Number(String(num).replace(/,/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  // Outside these ranges it is not the machine's weight (a bucket, an attachment, a typo).
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
    // A weight that belongs to a part or attachment ("bucket weighs 900 lbs") is not the machine's weight.
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
  // Labeled length / width / height in any order, e.g. "Length: 20 ft, Width: 8 ft, Height: 9 ft".
  const got = {};
  for (const [k, word] of [['L', 'length'], ['W', 'width'], ['H', 'height']]) {
    const m = s.match(new RegExp(`\\b(?:overall\\s+|transport\\s+)?${word}\\s*[:=-]?\\s*(${D_NUM})\\s*${D_UNIT}`, 'i'));
    if (m) got[k] = `${m[1]} ${unitName(m[2])}`;
  }
  if (got.L && got.W && got.H) return `${got.L} L x ${got.W} W x ${got.H} H`;
  // Three numbers joined by x, e.g. "dimensions: 20' x 8' x 9'". Two numbers alone (a model like D60x90) never match.
  const m = s.match(new RegExp(`(${D_NUM})${D_OPT}\\s*[x×X]\\s*(${D_NUM})${D_OPT}\\s*[x×X]\\s*(${D_NUM})${D_OPT}`));
  if (m) {
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    const looksLikeSize = /(dimensions?|size|l\s*x\s*w\s*x\s*h|transport|overall|length)\s*[:=-]?\s*$/i.test(before) || /(?:ft|feet|'|in|inches|")/i.test(m[0]);
    if (looksLikeSize) return m[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}
