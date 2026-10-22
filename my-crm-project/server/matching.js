
const CLOSED = ['Won', 'Lost'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Umbrella types: machines a buyer treats as one family. Trencher buyers also need a rock saw or plow mid-run.
const FAMILIES = [
  ['trencher', (n) => /trencher|rocksaw|plow/.test(n) && !/snow/.test(n)],
];
const family = (cat) => {
  const n = norm(cat).replace(/s$/, '');
  const f = FAMILIES.find(([, test]) => test(n));
  return f ? f[0] : n;
};
const series = (s) => (norm(s).match(/^[a-z]+\d+/) || [''])[0];

// Rule-based scoring of one lead's criteria against one unit.
// Only criteria the lead actually specified count toward the score.
function score(lead, unit) {
  const w = lead.wants || {};
  let earned = 0;
  let max = 0;
  let typeOk = true;
  const reasons = [];
  const add = (key, label, weight, frac, ok = frac >= 0.99) => {
    max += weight;
    earned += weight * frac;
    reasons.push({ key, label, ok, partial: !ok && frac > 0 });
  };

  if (w.category) {
    const a = family(w.category);
    const b = family(unit.category);
    typeOk = !!a && a === b; // same family only: rock saw/plow count as trencher, "Vacuum Excavator" is not an "Excavator"
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
    const price = unit.listPrice || unit.askPrice || 0; // buyers pay the public list price; ask is only the stand-in when none is set
    const f = !price ? 0.5 : price <= lead.budgetMax ? 1 : price <= lead.budgetMax * 1.1 ? 0.5 : 0;
    add('budget', f === 0.5 && price ? 'Near budget' : 'In budget', 20, f, f === 1);
  }
  if (lead.maxHours) {
    const h = unit.hours;
    const f = h == null ? 0 : h <= lead.maxHours ? 1 : h <= lead.maxHours * 1.2 ? 0.5 : 0;
    add('hours', h == null ? 'Hours pending' : f === 1 ? 'Hours OK' : 'Hours slightly over', 10, f, f === 1);
  }
  if (lead.minHp) {
    const hp = unit.hp ?? unit.oemSpecs?.hp; // OEM benchmark counts for matching, not for the verified record
    const f = hp == null ? 0 : hp >= lead.minHp ? 1 : 0;
    add('hp', hp == null ? 'HP pending' : 'HP OK', 10, f, f === 1);
  }
  if (w.minYear) add('year', 'Year', 5, unit.year && unit.year >= w.minYear ? 1 : 0);

  const hasCore = w.category || w.make || w.model;
  let pct = !hasCore || !max ? 0 : Math.round((earned / max) * 100);
  if (!typeOk) pct = Math.min(pct, 39); // wrong machine type never reaches the match threshold
  return { score: pct, reasons };
}

const live = (u) => u.status !== 'Sold';

function topBuyers(unit, leads, { limit = 3, min = 40 } = {}) {
  return leads
    .filter((l) => !CLOSED.includes(l.stage))
    .map((l) => ({ lead: l, ...score(l, unit) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function unitsForLead(lead, inventory, { limit = 5, min = 40 } = {}) {
  return inventory
    .filter(live)
    .map((u) => ({ unit: u, ...score(lead, u) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { score, topBuyers, unitsForLead, CLOSED };
