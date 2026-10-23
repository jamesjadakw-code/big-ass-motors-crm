// Live Email Generator: buyer-safe pitch drafts built from '.antigravity/email-template.json'.
// Only the template list (names, languages, subject lines, urgency tags) and the compliance rules are read from that file.
// Its "engine" / prompt sections (an outside AI model) are deliberately NOT imported: no buyer data leaves the CRM.
// Bodies are written here from confirmed unit fields only, so a template can never add a claim the data does not support.
import { templates as rawTemplates, compliance_and_safety as rawRules } from '@antigravity/email-template.json';

export const CTA = {
  en: 'Call or text for a walk-around video and inspection details.',
  es: 'Llame o envíe un mensaje de texto para un video de recorrido y detalles de inspección.',
};
// Always banned, whatever the JSON says.
const HARD_BANNED = ['Inspection welcome before any deposit.'];

const rules = rawRules && typeof rawRules === 'object' ? rawRules : {};
export const PITCH_RULES = {
  cta: { ...CTA, en: typeof rules.mandatory_cta === 'string' && rules.mandatory_cta.trim() ? rules.mandatory_cta.trim() : CTA.en },
  banned: [...new Set([...HARD_BANNED, ...(Array.isArray(rules.banned_phrases) ? rules.banned_phrases : [])].filter((p) => typeof p === 'string' && p.trim()))],
};

// The sample subjects in the JSON were written around one example machine; that literal is swapped for the matched unit.
const SAMPLE_MACHINE = /\bVermeer RTX1250\b/g;

const FALLBACK = [
  { id: 'first-look-en', name: 'First look (English)', lang: 'en', style: 'first-look', subject: 'Pre-Market: {{machine}} matched for {{company}}', tag: 'PRE_MARKET_INSPECTION' },
  { id: 'first-look-es', name: 'Primera vista (Español)', lang: 'es', style: 'first-look', subject: 'Acceso Pre-Mercado: {{machine}} para {{company}}', tag: 'PRE_MARKET_INSPECTION' },
];

const loaded = (Array.isArray(rawTemplates) ? rawTemplates : [])
  .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
  .map((t) => ({
    id: t.id,
    name: t.name,
    description: typeof t.description === 'string' ? t.description : '',
    lang: t.target_language === 'es' ? 'es' : 'en',
    style: /exact|fast|confirmed/i.test(t.id + ' ' + t.name) ? 'fast' : 'first-look',
    subject: String(t.sample_output?.subject || '').replace(SAMPLE_MACHINE, '{{machine}}'),
    tag: String(t.sample_output?.urgency_tag || ''),
  }));
export const PITCH_TEMPLATES = loaded.length ? loaded : FALLBACK;
export const TEMPLATE_SOURCE = loaded.length ? '.antigravity/email-template.json' : 'built-in (template file had no usable templates)';

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const machineName = (u) => [u.make, u.model].filter(Boolean).join(' ') || u.category || 'machine';

/** The only unit fields a pitch may use. Internal price, seller details, unit location and source URL are never read. */
function safeFacts(unit) {
  // Operating weight and dimensions are left out of a pitch entirely unless stated; they are never listed as pending.
  const pending = (Array.isArray(unit.pendingFields) ? unit.pendingFields : []).filter((k) => typeof k === 'string' && k !== 'weight' && k !== 'dimensions');
  const hours = Number.isFinite(unit.hours) && unit.hours > 0 ? unit.hours : null;
  return {
    title: [unit.year, unit.make, unit.model].filter(Boolean).join(' ') || machineName(unit),
    machine: machineName(unit),
    stock: unit.stock || '',
    hours,
    price: Number.isFinite(unit.listPrice) && unit.listPrice > 0 ? unit.listPrice : null,
    pending: [...new Set(pending)],
    listed: unit.status === 'Live',
  };
}

function fill(text, lead, unit, f) {
  const vals = {
    firstName: lead.firstName || '', lastName: lead.lastName || '', company: lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'you',
    machine: f.machine, stock: f.stock, year: unit.year || '', make: unit.make || '', model: unit.model || '', category: unit.category || '',
  };
  return String(text).replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, k) => vals[k.split('.').pop()] ?? '').replace(/\s{2,}/g, ' ').replace(/\(\s*Stock\s*\)/i, '').trim();
}

function body(tpl, lead, f) {
  const lang = tpl.lang;
  const first = lead.firstName || (lang === 'es' ? 'Hola' : 'Hi');
  const want = [lead.wants?.make, lead.wants?.model].filter(Boolean).join(' ') || (lead.wants?.category || '').toLowerCase();
  const lines = [];
  if (lang === 'es') {
    lines.push(`${first}: ingresó a nuestro canal una ${f.title} que coincide con su búsqueda${want ? ` de ${want}` : ''}.`);
    lines.push(`Stock ${f.stock}.${f.hours ? ` ${f.hours.toLocaleString('en-US')} horas.` : ''} ${f.price ? usd(f.price) : 'Llame para el precio'}.`);
    if (!f.listed) lines.push('Aún no se publica en el inventario abierto: se la presento primero.');
    lines.push(PITCH_RULES.cta.es);
  } else if (tpl.style === 'fast') {
    lines.push(`${first} - the ${f.title}${want ? ` that fits your ${want} search` : ''} is in our pipeline (Stock ${f.stock}).`);
    lines.push(`${f.hours ? `${f.hours.toLocaleString('en-US')} hours. ` : ''}${f.price ? usd(f.price) : 'Call for price'}.`);
    lines.push("If you need it on your job site this month, let's hold your spot now.");
    lines.push(PITCH_RULES.cta.en);
  } else {
    lines.push(`${first} - a ${f.title} just came into our acquisition channel${want ? ` and it lines up with your ${want} search` : ''}.`);
    lines.push(`Stock ${f.stock}.${f.hours ? ` ${f.hours.toLocaleString('en-US')} hours.` : ''} ${f.price ? usd(f.price) : 'Call for price'}.`);
    if (!f.listed) lines.push("It isn't on our public inventory yet, so you get first look.");
    lines.push(PITCH_RULES.cta.en);
  }
  return lines.join(' ');
}

export function defaultTemplateFor(lead) {
  const lang = lead?.language === 'es' ? 'es' : 'en';
  return PITCH_TEMPLATES.find((t) => t.lang === lang) || PITCH_TEMPLATES[0];
}

export function buildPitch(templateId, lead, unit) {
  const tpl = PITCH_TEMPLATES.find((t) => t.id === templateId) || defaultTemplateFor(lead);
  const f = safeFacts(unit);
  const subject = fill(tpl.subject || '{{machine}} for {{company}}', lead, unit, f);
  return { subject: sanitize(subject, tpl.lang, unit, false), body: sanitize(body(tpl, lead, f), tpl.lang, unit, true), lang: tpl.lang, tag: tpl.tag, pending: f.pending };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Internal values that must never reach a buyer, taken from the unit itself. */
function internalValues(unit) {
  const out = [];
  for (const k of ['askPrice', 'buyPrice']) {
    const n = Number(unit[k]);
    if (Number.isFinite(n) && n > 0 && n !== Number(unit.listPrice)) out.push(usd(n), String(Math.round(n)));
  }
  if (unit.sourceUrl) out.push(String(unit.sourceUrl));
  return out.filter((v) => v.length > 3);
}

/** Problems in a (possibly hand-edited) draft. An empty list means it is safe to copy. */
export function checkPitch(text, lang, unit) {
  const t = String(text || '');
  const issues = [];
  for (const p of PITCH_RULES.banned) if (new RegExp(esc(p.replace(/\.$/, '')), 'i').test(t)) issues.push({ key: 'banned', label: `Banned phrase: "${p}"`, fix: true });
  if (internalValues(unit).some((v) => t.includes(v))) issues.push({ key: 'internal', label: 'Contains an internal price or the source link', fix: true });
  if (!t.includes(PITCH_RULES.cta[lang] || PITCH_RULES.cta.en)) issues.push({ key: 'cta', label: 'Missing the closing line (walk-around video)', fix: true });
  return issues;
}

/** Remove banned phrases and internal values; make sure the mandatory closing line is there (body only). */
export function sanitize(text, lang, unit, needCta) {
  let t = String(text || '');
  for (const p of PITCH_RULES.banned) t = t.replace(new RegExp(esc(p.replace(/\.$/, '')) + '\\.?', 'gi'), '');
  for (const v of internalValues(unit)) t = t.split(v).join('');
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,])/g, '$1').trim();
  const cta = PITCH_RULES.cta[lang] || PITCH_RULES.cta.en;
  if (needCta && !t.includes(cta)) t = `${t}${t && !/[.!?]$/.test(t) ? '.' : ''} ${cta}`.trim();
  return t;
}
