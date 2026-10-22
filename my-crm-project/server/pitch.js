const config = require('./config');

const ES_WORDS = /\b(hola|gracias|quiere|necesita|llamar|llam[eé]|equipo|m[aá]quina|ma[ñn]ana|precio|puedo|tiene|cu[aá]ndo|buenos|enviar|env[ií]a)\b/i;
const detectSpanish = (text) => ES_WORDS.test(text || '');

const money = (n) => (n ? '$' + Math.round(n).toLocaleString('en-US') : null);
const unitTitle = (u) => [u.year, u.make, u.model].filter(Boolean).join(' ');

// Buyer-safe: never includes askPrice / buyPrice / seller info / source URL.
function draftPitch(lead, unit) {
  const es = lead.language === 'es';
  const first = lead.firstName || 'there';
  const hours = unit.hours != null ? `${unit.hours.toLocaleString('en-US')} hrs` : null;
  const service = unit.serviceHistory && !/not verified/i.test(unit.serviceHistory) ? unit.serviceHistory : null;
  const price = money(unit.listPrice);
  const title = unitTitle(unit);
  const agent = config.agent;
  const bits = [hours, service].filter(Boolean).join(' · ');

  if (es) {
    const sms = `Hola ${first}, soy ${agent} de ${config.company}. Tengo un ${title}${bits ? ` (${bits})` : ''} listo para inspección. ${price ? `Precio: ${price}. ` : 'Llame para el precio. '}¿Cuándo lo necesita en obra? Le envío la ficha técnica ahora.`;
    return { sms, subject: `${title} — ficha técnica`, body: `${sms}\n\nSaludos,\n${agent}\n${config.company}` };
  }
  const sms = `Hi ${first}, ${agent} with ${config.company}. I have a ${title}${bits ? ` (${bits})` : ''} ready for inspection. ${price ? `Priced at ${price}. ` : 'Call for price. '}When do you need it on site${lead.city ? ' in ' + lead.city : ''}? Sending you the spec sheet now.`;
  return {
    sms,
    subject: `${title} — spec sheet`,
    body: `Hi ${first},\n\n${sms.replace(/^Hi [^,]+, /, '')}\n\nThanks,\n${agent}\n${config.company}`,
  };
}

function nextWeekdayAt10(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

function followUpDraft(lead, note) {
  const es = lead.language === 'es' || detectSpanish(note);
  const first = lead.firstName || '';
  return es
    ? `Hola ${first}, gracias por su tiempo hoy. Quedo atento a lo que hablamos. ¿Le mando fotos y la ficha técnica? — ${config.agent}, ${config.company}`
    : `Hi ${first}, thanks for your time today. Following up on what we discussed. Want me to send photos and the spec sheet? — ${config.agent}, ${config.company}`;
}

module.exports = { draftPitch, detectSpanish, nextWeekdayAt10, followUpDraft, unitTitle };
