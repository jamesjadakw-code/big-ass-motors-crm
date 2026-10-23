// 3rd-party machine pipeline: Scraped → Matched → BAM-branded → Pitched.
// BAM rule: only scraped (third-party) machines are matched to buyers and pitched; BAM's own inventory never is.

export const isThirdParty = (u) =>
  !!u && u.status !== 'Sold' && (u.thirdParty === true || (u.thirdParty === undefined && !!String(u.sourceUrl || '').trim()));

export const LANES = [
  { key: 'scraped', title: 'Scraped', sub: 'Grabbed or pulled · specs parsed, never guessed', rgb: '255 107 112' },
  { key: 'matched', title: 'Matched', sub: 'Scored at scrape · internal only', rgb: 'var(--bam-gold-rgb)' },
  { key: 'branded', title: 'BAM-branded', sub: 'Verified · BAM brochure · Call for Price', rgb: '52 211 153' },
  { key: 'pitched', title: 'Pitched', sub: 'Text · e-mail · Gmail draft with brochure', rgb: '122 180 255' },
];

/** Which lane a machine sits in. `pitched` = a buyer has been pitched on it. */
export function stageOf(unit, pitched = false) {
  if (pitched) return 'pitched';
  if (unit.verified) return 'branded';
  if ((unit.buyerCount ?? 0) > 0 || (unit.topScore ?? 0) > 0) return 'matched';
  return 'scraped';
}

/** Where the listing came from, for the card subtitle (host name only). */
export function sourceName(unit) {
  const url = String(unit.sourceUrl || '').trim();
  if (!url) return 'Third-party listing';
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (/facebook\.com$/.test(h)) return 'FB Marketplace';
    if (/machinerytrader\.com$/.test(h)) return 'Machinery Trader';
    return h;
  } catch { return 'Third-party listing'; }
}

// ---- Listing score + automatic review tasks for newly scraped machines ----
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * How complete a scraped listing is: up to 60 points for photos (6 each, 10 photos = full) and 40 for stated info
 * (4 each across 10 fields). Only values the listing actually states count, so nothing is guessed.
 */
export function listingScore(u) {
  const photos = Array.isArray(u.media) ? u.media.filter(has).length : 0;
  const info = [
    has(u.year), has(u.make), has(u.model), has(u.hours), has(u.serial),
    has(u.engineModel) || has(u.hp), has(u.weight) || has(u.dimensions), has(u.attachments),
    has(u.city) && has(u.state), has(u.narrative) || has(u.serviceHistory),
  ].filter(Boolean).length;
  const score = Math.min(photos, 10) * 6 + info * 4;
  return { score, photos, info, label: score >= 75 ? 'High' : score >= 50 ? 'Good' : 'Thin' };
}

const at5pm = (iso) => { const d = iso ? new Date(iso) : new Date(); if (Number.isNaN(d.getTime())) return new Date(new Date().setHours(17, 0, 0, 0)); d.setHours(17, 0, 0, 0); return d; };

/**
 * One review task per scraped machine that is not yet verified or marked reviewed. Derived from the units, so a new
 * scrape shows up on its own and a verified, sold or reviewed machine drops off. Due 5 PM the day it was scraped.
 */
export function listingTasks(units) {
  return (units || []).filter((u) => isThirdParty(u) && !u.verified && !u.listingReviewed).map((u) => {
    const sc = listingScore(u);
    const title = [u.year, u.make, u.model].filter(Boolean).join(' ') || 'Unit';
    const source = sourceName(u);
    return {
      id: `listing-${u.id}`, kind: 'listing', unitId: u.id, title: `Review new listing: ${title}`,
      due: at5pm(u.createdAt).toISOString(), done: false, priority: sc.score >= 75 ? 'high' : 'normal', auto: true, lead: null,
      note: `${source} · ${sc.photos} photo${sc.photos === 1 ? '' : 's'} · listing score ${sc.score}`,
      listing: { title, type: u.category || 'Other', source, score: sc.score, label: sc.label, photos: sc.photos, city: u.city, state: u.state },
    };
  });
}
