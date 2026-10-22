const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const store = require('./store');
const { topBuyers, unitsForLead, CLOSED } = require('./matching');
const { parseListing } = require('./parser');
const { draftPitch, detectSpanish, nextWeekdayAt10, followUpDraft } = require('./pitch');
const { featureSheet, renderSheet, heroImage } = require('./pdf');
const config = require('./config');
const google = require('./google');
const { safeName } = require('./mime');

const PORT = process.env.PORT || 4000;
const STAGES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];
const URGENCY = ['Low', 'Medium', 'High'];
const UNIT_STATUS = ['Draft', 'Live', 'Sold'];

const app = express();
// No login, so only this computer's own pages may talk to the API: other websites can't read or change your CRM
// through your browser (CORS), and a hostile DNS name pointed at 127.0.0.1 is refused (Host check).
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({ origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)) }));
app.use((req, res, next) => {
  if (!process.env.HOST || process.env.HOST === '127.0.0.1') {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return res.status(403).json({ error: 'Forbidden host' });
  }
  next();
});
app.use(express.json({ limit: '2mb' }));

const db = () => store.get();
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (res.headersSent) return res.end();
    res.status(e.status || 500).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
  }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- normalization ----------
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
const str = (v) => (v == null ? undefined : String(v).trim());
const normEmail = (e) => String(e || '').trim().toLowerCase();
const digits = (p) => String(p || '').replace(/\D/g, '');

function cleanLead(b) {
  const out = {};
  for (const k of ['firstName', 'lastName', 'company', 'city', 'notes', 'source']) if (b[k] !== undefined) out[k] = str(b[k]);
  if (b.email !== undefined) out.email = normEmail(b.email);
  if (b.phone !== undefined) out.phone = str(b.phone);
  if (b.state !== undefined) out.state = str(b.state).toUpperCase();
  if (b.stage !== undefined) {
    if (!STAGES.includes(b.stage)) throw fail(400, `stage must be one of ${STAGES.join(', ')}`);
    out.stage = b.stage;
  }
  if (b.urgency !== undefined) {
    if (!URGENCY.includes(b.urgency)) throw fail(400, `urgency must be one of ${URGENCY.join(', ')}`);
    out.urgency = b.urgency;
  }
  if (b.language !== undefined) out.language = b.language === 'es' ? 'es' : 'en';
  for (const k of ['budgetMax', 'maxHours', 'minHp']) {
    if (b[k] !== undefined) {
      const n = num(b[k]);
      if (n !== undefined && n < 0) throw fail(400, `${k} must be non-negative`);
      out[k] = n;
    }
  }
  if (b.wants) {
    out.wants = {};
    for (const k of ['make', 'model', 'category']) if (b.wants[k]) out.wants[k] = str(b.wants[k]);
    if (num(b.wants.minYear)) out.wants.minYear = num(b.wants.minYear);
  }
  return out;
}

// Strict dedupe: LOWER(TRIM(email)); phone digits as fallback when no email.
function findDuplicate(email, phone) {
  const e = normEmail(email);
  const p = digits(phone);
  return db().leads.find((l) => (e && l.email === e) || (!e && p.length >= 7 && digits(l.phone) === p));
}

// Create or merge. Merging fills blanks, overwrites wants/prefs, and appends to history.
function upsertLead(input, source = 'Manual') {
  const data = cleanLead(input);
  if (!data.firstName && !data.lastName && !data.company) throw fail(400, 'a name or company is required');
  if (!data.email && !digits(data.phone)) throw fail(400, 'email or phone is required');
  const existing = findDuplicate(data.email, data.phone);
  const stamp = store.now();
  if (existing) {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'wants') existing.wants = { ...(existing.wants || {}), ...v };
      else if (v !== undefined && v !== '' && (existing[k] === undefined || existing[k] === '' || ['budgetMax', 'maxHours', 'minHp', 'urgency', 'language'].includes(k))) existing[k] = v;
    }
    existing.interactions.push({ id: store.id(), at: stamp, type: 'import', note: `Re-ingested from ${source}; preferences updated.` });
    return { lead: existing, created: false };
  }
  const lead = {
    id: store.id(), createdAt: stamp, stage: 'New', urgency: 'Medium', language: 'en', notes: '', wants: {},
    interactions: [{ id: store.id(), at: stamp, type: 'import', note: `Created from ${source}.` }],
    source, ...data,
  };
  db().leads.push(lead);
  return { lead, created: true };
}

const REQUIRED = ['year', 'make', 'model', 'serial', 'hours'];
function pendingOf(u) {
  const missing = REQUIRED.filter((k) => u[k] == null || u[k] === '');
  for (const k of ['hp', 'weight', 'dimensions']) if (u[k] == null || u[k] === '') missing.push(k);
  return missing;
}

function cleanUnit(b, partial = false) {
  const out = {};
  for (const k of ['make', 'model', 'category', 'serial', 'engineModel', 'weight', 'dimensions', 'attachments',
    'hydraulicFlow', 'serviceHistory', 'inspectionNotes', 'sellerStatus', 'city', 'sourceUrl', 'narrative', 'knownDefects', 'stock']) {
    if (b[k] !== undefined) out[k] = str(b[k]);
  }
  if (b.state !== undefined) out.state = str(b.state).toUpperCase();
  for (const k of ['year', 'hours', 'hp', 'askPrice', 'listPrice', 'buyPrice']) {
    if (b[k] !== undefined) {
      const n = num(b[k]);
      if (n !== undefined && n < 0) throw fail(400, `${k} must be non-negative`);
      out[k] = n === undefined ? null : n;
    }
  }
  if (b.status !== undefined) {
    if (!UNIT_STATUS.includes(b.status)) throw fail(400, `status must be one of ${UNIT_STATUS.join(', ')}`);
    out.status = b.status;
  }
  if (b.inspected !== undefined) out.inspected = !!b.inspected;
  if (b.oemSpecs !== undefined) out.oemSpecs = b.oemSpecs;
  if (b.media !== undefined) out.media = Array.isArray(b.media) ? b.media : String(b.media).split('\n').map((s) => s.trim()).filter(Boolean);
  if (!partial && !(out.make || out.model)) throw fail(400, 'make or model is required');
  return out;
}

const nextStock = () => {
  const nums = db().inventory.map((u) => Number(String(u.stock || '').replace(/\D/g, '')) || 0);
  return 'BAM-' + (Math.max(1000, ...nums) + 1);
};

const withDerived = (u) => ({
  ...u,
  pendingFields: pendingOf(u),
  margin: (u.listPrice || u.askPrice) && u.buyPrice ? (u.listPrice || u.askPrice) - u.buyPrice : null,
});

// ---------- leads ----------
app.get('/api/leads', wrap((req, res) => {
  let list = db().leads;
  const { stage, q } = req.query;
  if (stage && STAGES.includes(stage)) list = list.filter((l) => l.stage === stage);
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter((l) => [l.firstName, l.lastName, l.email, l.company, l.city, l.phone, l.wants?.model, l.wants?.make]
      .some((f) => (f || '').toLowerCase().includes(s)));
  }
  const inv = db().inventory;
  res.json(list.map((l) => {
    const best = unitsForLead(l, inv, { limit: 1 })[0];
    return { ...l, bestMatch: best ? { unitId: best.unit.id, title: [best.unit.year, best.unit.make, best.unit.model].join(' '), score: best.score } : null };
  }));
}));

app.get('/api/leads/:id', wrap((req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) throw fail(404, 'Lead not found');
  res.json(l);
}));

app.post('/api/leads', wrap((req, res) => {
  const { lead, created } = upsertLead(req.body, 'Manual entry');
  store.save();
  res.status(created ? 201 : 200).json({ lead, created, merged: !created });
}));

app.put('/api/leads/:id', wrap((req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) throw fail(404, 'Lead not found');
  const data = cleanLead(req.body);
  if (data.email && data.email !== l.email) {
    const dup = findDuplicate(data.email);
    if (dup && dup.id !== l.id) throw fail(409, `Another lead already uses ${data.email}`);
  }
  const prevStage = l.stage;
  const { wants, ...rest } = data;
  Object.assign(l, rest);
  if (wants) l.wants = wants;
  if (data.stage && data.stage !== prevStage) {
    l.interactions.push({ id: store.id(), at: store.now(), type: 'stage', note: `Stage: ${prevStage} → ${data.stage}` });
  }
  store.save();
  res.json(l);
}));

app.delete('/api/leads/:id', wrap((req, res) => {
  const d = db();
  const i = d.leads.findIndex((x) => x.id === req.params.id);
  if (i === -1) throw fail(404, 'Lead not found');
  const [gone] = d.leads.splice(i, 1);
  d.tasks = d.tasks.filter((t) => t.leadId !== gone.id);
  d.matches = d.matches.filter((m) => m.leadId !== gone.id);
  store.save();
  res.json(gone);
}));

// Bulk import: JSON array of leads or CSV text.
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const CSV_MAP = {
  first_name: 'firstName', firstname: 'firstName', last_name: 'lastName', lastname: 'lastName', email: 'email',
  phone: 'phone', company: 'company', city: 'city', state: 'state', budget: 'budgetMax', budget_max: 'budgetMax',
  max_hours: 'maxHours', min_hp: 'minHp', urgency: 'urgency', stage: 'stage', notes: 'notes', language: 'language',
  make: 'w.make', model: 'w.model', category: 'w.category', target_equipment: 'w.model', min_year: 'w.minYear',
};

app.post('/api/leads/import', wrap((req, res) => {
  let records = req.body.leads;
  if (!records && typeof req.body.csv === 'string') {
    const rows = parseCsv(req.body.csv);
    if (rows.length < 2) throw fail(400, 'CSV needs a header row and at least one data row');
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    records = rows.slice(1).map((r) => {
      const o = { wants: {} };
      header.forEach((h, i) => {
        const key = CSV_MAP[h];
        const v = (r[i] || '').trim();
        if (!key || !v) return;
        if (key.startsWith('w.')) o.wants[key.slice(2)] = v;
        else o[key] = v;
      });
      return o;
    });
  }
  if (!Array.isArray(records)) throw fail(400, 'provide { leads: [...] } or { csv: "..." }');
  const result = { created: 0, merged: 0, skipped: [] };
  records.forEach((r, i) => {
    try {
      const { created } = upsertLead(r, 'Bulk import');
      result[created ? 'created' : 'merged']++;
    } catch (e) {
      result.skipped.push({ row: i + 1, reason: e.message });
    }
  });
  store.save();
  res.json(result);
}));

app.post('/api/leads/:id/calls', wrap((req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) throw fail(404, 'Lead not found');
  const note = str(req.body.note) || '';
  if (!note) throw fail(400, 'a call note is required');
  const es = detectSpanish(note);
  if (es) l.language = 'es';
  l.interactions.push({ id: store.id(), at: store.now(), type: 'call', note });
  if (l.stage === 'New') l.stage = 'Contacted';
  const due = nextWeekdayAt10();
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.company;
  const task = { id: store.id(), title: `Follow up: ${name}`, leadId: l.id, due: due.toISOString(), done: false, priority: l.urgency === 'High' ? 'high' : 'normal', auto: true, note };
  db().tasks.push(task);
  store.save();
  res.json({ lead: l, task, language: l.language, draft: followUpDraft(l, note) });
}));

app.post('/api/leads/:id/interactions', wrap((req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) throw fail(404, 'Lead not found');
  const type = ['text', 'email', 'brochure', 'note'].includes(req.body.type) ? req.body.type : 'note';
  l.interactions.push({ id: store.id(), at: store.now(), type, note: str(req.body.note) || '', unitId: req.body.unitId });
  if (req.body.unitId && type !== 'note') {
    const d = db();
    let m = d.matches.find((x) => x.leadId === l.id && x.unitId === req.body.unitId);
    if (!m) d.matches.push((m = { leadId: l.id, unitId: req.body.unitId }));
    m.status = 'pitched';
    m.at = store.now();
  }
  store.save();
  res.json(l);
}));

app.get('/api/leads/:id/matches', wrap((req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) throw fail(404, 'Lead not found');
  res.json(unitsForLead(l, db().inventory, { limit: 8 }).map((m) => ({ ...m, unit: withDerived(m.unit) })));
}));

// ---------- inventory ----------
app.get('/api/inventory', wrap((req, res) => {
  let list = db().inventory;
  const { status, q } = req.query;
  if (status && UNIT_STATUS.includes(status)) list = list.filter((u) => u.status === status);
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter((u) => [u.stock, u.year, u.make, u.model, u.category, u.serial, u.city, u.state].some((f) => String(f ?? '').toLowerCase().includes(s)));
  }
  const leads = db().leads;
  res.json(list.map((u) => {
    const tops = topBuyers(u, leads, { limit: 3 });
    return { ...withDerived(u), topScore: tops[0]?.score ?? 0, buyerCount: topBuyers(u, leads, { limit: 99 }).length };
  }));
}));

app.get('/api/inventory/:id', wrap((req, res) => {
  const u = db().inventory.find((x) => x.id === req.params.id);
  if (!u) throw fail(404, 'Unit not found');
  res.json(withDerived(u));
}));

app.post('/api/inventory', wrap((req, res) => {
  const data = cleanUnit(req.body);
  const unit = {
    id: store.id(), createdAt: store.now(), status: 'Draft', media: [], oemSpecs: {}, sellerStatus: '',
    ...data, stock: data.stock || nextStock(),
  };
  db().inventory.push(unit);
  store.save();
  res.status(201).json(withDerived(unit));
}));

app.put('/api/inventory/:id', wrap((req, res) => {
  const u = db().inventory.find((x) => x.id === req.params.id);
  if (!u) throw fail(404, 'Unit not found');
  Object.assign(u, cleanUnit(req.body, true));
  store.save();
  res.json(withDerived(u));
}));

app.delete('/api/inventory/:id', wrap((req, res) => {
  const d = db();
  const i = d.inventory.findIndex((x) => x.id === req.params.id);
  if (i === -1) throw fail(404, 'Unit not found');
  const [gone] = d.inventory.splice(i, 1);
  d.matches = d.matches.filter((m) => m.unitId !== gone.id);
  store.save();
  res.json(gone);
}));

// Top buyers for a unit, with buyer-safe pitch drafts attached.
app.get('/api/inventory/:id/matches', wrap((req, res) => {
  const u = db().inventory.find((x) => x.id === req.params.id);
  if (!u) throw fail(404, 'Unit not found');
  const min = num(req.query.min) ?? 40;
  const rows = topBuyers(u, db().leads, { limit: num(req.query.limit) || 5, min }).map((m) => {
    const rec = db().matches.find((x) => x.leadId === m.lead.id && x.unitId === u.id);
    return { ...m, status: rec?.status || 'new', pitch: draftPitch(m.lead, u), pitches: { en: draftPitch({ ...m.lead, language: 'en' }, u), es: draftPitch({ ...m.lead, language: 'es' }, u) } };
  });
  res.json(rows);
}));

app.post('/api/matches/status', wrap((req, res) => {
  const { leadId, unitId, status } = req.body;
  if (!['new', 'drafted', 'pitched', 'dismissed'].includes(status)) throw fail(400, 'invalid status');
  const d = db();
  let m = d.matches.find((x) => x.leadId === leadId && x.unitId === unitId);
  if (!m) d.matches.push((m = { leadId, unitId }));
  m.status = status;
  m.at = store.now();
  store.save();
  res.json(m);
}));

// ---------- Google Workspace: connection + bulk pitch drafts ----------
app.get('/api/google/status', wrap((req, res) => res.json(google.status())));

// Browser navigation: sends the user to Google's consent screen as sales@ (login_hint), then back to /api/google/callback.
app.get('/api/google/connect', (req, res) => {
  try {
    res.redirect(google.authUrl(String(req.query.returnTo || '')));
  } catch (e) {
    res.status(e.status || 500).type('html').send(`<p style="font-family:sans-serif">${String(e.message).replace(/</g, '&lt;')}</p>`);
  }
});
app.get('/api/google/callback', async (req, res) => {
  const back = (origin, qs) => res.redirect(`${origin || ''}/#/match?google=${qs}`);
  try {
    if (req.query.error) throw new google.GoogleError(`Google sign-in was cancelled (${req.query.error}).`, 'GOOGLE_DENIED');
    const { returnTo } = await google.handleCallback(String(req.query.code || ''), String(req.query.state || ''));
    back(returnTo, 'connected');
  } catch (e) {
    back(null, 'error&message=' + encodeURIComponent(e.message));
  }
});
app.post('/api/google/disconnect', wrap((req, res) => { google.disconnect(); res.json(google.status()); }));

const MAX_BULK = 25;

// Body: { unitId, leadIds: [..] }. For each buyer: render a personalized feature sheet (PDF), then create a Gmail draft
// from the sales mailbox with that PDF attached. Drafts are never sent. One buyer failing never stops the rest.
app.post('/api/pitch/bulk', wrap(async (req, res) => {
  const { unitId, leadIds } = req.body || {};
  const unit = db().inventory.find((u) => u.id === unitId);
  if (!unit) throw fail(404, 'Unit not found');
  if (!Array.isArray(leadIds)) throw fail(400, 'leadIds must be a list of buyer ids');
  const ids = [...new Set(leadIds.filter((x) => typeof x === 'string' && x))];
  if (!ids.length) throw fail(400, 'Select at least one buyer');
  if (ids.length > MAX_BULK) throw fail(400, `Select at most ${MAX_BULK} buyers at a time`);

  const g = google.status();
  if (!g.configured) throw Object.assign(fail(409, 'Google is not set up yet. Add the Google keys to server/.env (see GOOGLE-SETUP.md).'), { code: 'GOOGLE_NOT_CONFIGURED' });
  if (!g.connected) throw Object.assign(fail(409, `Connect Google (${g.sender}) first.`), { code: 'GOOGLE_NOT_CONNECTED' });

  const photo = await heroImage(unit); // download the hero image once, not once per buyer
  const results = [];
  let aborted = null;
  for (const id of ids) {
    const lead = db().leads.find((l) => l.id === id);
    const name = lead ? ([lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || 'Buyer') : 'Unknown buyer';
    if (aborted) { results.push({ leadId: id, name, ok: false, reason: aborted }); continue; }
    if (!lead) { results.push({ leadId: id, name, ok: false, reason: 'Buyer not found' }); continue; }
    if (!lead.email) { results.push({ leadId: id, name, ok: false, reason: 'No email address on file' }); continue; }
    try {
      const pitch = draftPitch(lead, unit);
      const pdf = await renderSheet(unit, {
        photo,
        buyer: { name, company: lead.company || '', destination: [lead.city, lead.state].filter(Boolean).join(', ') },
      });
      const filename = `${safeName(unit.stock || 'unit')}-${safeName(lead.lastName || lead.company || 'buyer')}-feature-sheet.pdf`;
      const draft = await google.createDraft({
        to: lead.email, subject: pitch.subject, text: pitch.body,
        attachments: [{ filename, type: 'application/pdf', buffer: pdf }],
      });
      lead.interactions.push({ id: store.id(), at: store.now(), type: 'note', note: `Gmail draft created for ${[unit.year, unit.make, unit.model].filter(Boolean).join(' ')} with feature sheet (not sent yet)`, unitId: unit.id });
      let m = db().matches.find((x) => x.leadId === lead.id && x.unitId === unit.id);
      if (!m) db().matches.push((m = { leadId: lead.id, unitId: unit.id }));
      if (m.status !== 'pitched') { m.status = 'drafted'; m.at = store.now(); }
      results.push({ leadId: id, name, email: lead.email, ok: true, draftId: draft.draftId, composeUrl: draft.composeUrl, attachment: filename });
    } catch (e) {
      if (e.code === 'GOOGLE_AUTH_EXPIRED' || e.code === 'GOOGLE_NOT_CONNECTED') aborted = e.message;
      results.push({ leadId: id, name, ok: false, reason: e.message });
    }
  }
  store.save();
  res.json({ sender: g.email || g.sender, created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}));

app.get('/api/inventory/:id/brochure.pdf', wrap(async (req, res) => {
  const u = db().inventory.find((x) => x.id === req.params.id);
  if (!u) throw fail(404, 'Unit not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${u.stock || 'unit'}-feature-sheet.pdf"`);
  await featureSheet(u, res);
}));

// ---------- ingestion ----------
const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(u || '');
const metaOf = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? m[1] : '';
};

// SSRF guard: every hop (including redirects) must resolve only to public addresses.
const dns = require('dns').promises;
const net = require('net');
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
async function assertPublicUrl(urlStr) {
  const u = new URL(urlStr);
  if (!/^https?:$/.test(u.protocol)) throw fail(400, 'only http(s) links are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw fail(400, 'local addresses are not allowed');
}
async function safeFetch(url) {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(cur);
    const r = await fetch(cur, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'text/html' },
      redirect: 'manual', signal: AbortSignal.timeout(12000),
    });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
    return r;
  }
  throw fail(502, 'Too many redirects');
}
async function readCapped(r, max = 2_000_000) { // never buffer an unbounded response
  const reader = r.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    if (n >= max) { await reader.cancel(); break; }
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, max);
}

// Server-side pull for sites that allow it. Login-walled sites (Facebook) need the BAM Grabber bookmarklet.
app.post('/api/ingest/pull', async (req, res) => {
  try {
    const url = str(req.body.url);
    if (!isHttpUrl(url)) throw fail(400, 'enter a full http(s) listing URL');
    const r = await safeFetch(url);
    if (!r.ok) throw fail(502, `The site refused the request (${r.status}). Use the BAM Grabber bookmarklet from your own browser instead.`);
    const html = await readCapped(r);
    const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
    const text = [title, metaOf(html, 'og:title'), metaOf(html, 'og:description'), metaOf(html, 'description'), html].join(' ');
    if (/log in|sign in to continue|checkpoint/i.test(title) && !metaOf(html, 'og:description')) {
      throw fail(422, 'That page needs a login. Open the listing in your browser and click the BAM Grabber bookmarklet.');
    }
    const images = [metaOf(html, 'og:image')].filter(Boolean);
    res.json(ingestParse(text, url, images));
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'The site took too long to respond.' : e.message;
    res.status(e.status || 502).json({ error: msg });
  }
});

function ingestParse(text, url, images = []) {
  const r = parseListing(text, url);
  if (images.length) r.fields.media = images.filter(isHttpUrl).slice(0, 12);
  const dup = r.fields.serial && db().inventory.find((u) => u.serial && u.serial === r.fields.serial);
  const probe = { ...r.fields, oemSpecs: r.oemSpecs, status: 'Draft' };
  return {
    ...r,
    duplicateOf: dup ? { id: dup.id, stock: dup.stock } : null,
    preview: topBuyers(probe, db().leads, { limit: 3 })
      .map((m) => ({ id: m.lead.id, name: [m.lead.firstName, m.lead.lastName].filter(Boolean).join(' '), company: m.lead.company, score: m.score })),
  };
}

app.post('/api/ingest/parse', wrap((req, res) => {
  const { text, url, images } = req.body;
  if (!text || !String(text).trim()) throw fail(400, 'paste the listing text to parse');
  res.json(ingestParse(text, url, Array.isArray(images) ? images : []));
}));

// ---------- tasks / today ----------

// A follow-up task explains itself: its own note, else the lead's latest call note.
const taskNote = (t, lead) => t.note || (t.auto && lead ? [...(lead.interactions || [])].reverse().find((i) => i.type === 'call')?.note : '') || '';

app.get('/api/tasks', wrap((req, res) => {
  const leads = db().leads;
  res.json(db().tasks
    .map((t) => { const lead = leads.find((l) => l.id === t.leadId) || null; return { ...t, note: taskNote(t, lead), lead }; })
    .sort((a, b) => new Date(a.due) - new Date(b.due)));
}));

app.post('/api/tasks', wrap((req, res) => {
  const title = str(req.body.title);
  if (!title) throw fail(400, 'title is required');
  const due = req.body.due ? new Date(req.body.due) : nextWeekdayAt10();
  if (Number.isNaN(due.getTime())) throw fail(400, 'invalid due date');
  const t = { id: store.id(), title, leadId: req.body.leadId || null, due: due.toISOString(), done: false, priority: req.body.priority === 'high' ? 'high' : 'normal' };
  db().tasks.push(t);
  store.save();
  res.status(201).json(t);
}));

app.put('/api/tasks/:id', wrap((req, res) => {
  const t = db().tasks.find((x) => x.id === req.params.id);
  if (!t) throw fail(404, 'Task not found');
  if (req.body.done !== undefined) { t.done = !!req.body.done; t.doneAt = t.done ? store.now() : undefined; }
  if (req.body.due) t.due = new Date(req.body.due).toISOString();
  if (req.body.title) t.title = str(req.body.title);
  store.save();
  res.json(t);
}));

app.delete('/api/tasks/:id', wrap((req, res) => {
  const d = db();
  d.tasks = d.tasks.filter((x) => x.id !== req.params.id);
  store.save();
  res.json({ ok: true });
}));

const sameDay = (a, b) => a.toDateString() === b.toDateString();

app.get('/api/today', wrap((req, res) => {
  const d = db();
  const now = new Date();
  const withLead = (t) => { const lead = d.leads.find((l) => l.id === t.leadId) || null; return { ...t, note: taskNote(t, lead), lead }; };
  const open = d.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => new Date(t.due) < now && !sameDay(new Date(t.due), now)).map(withLead);
  const dueToday = open.filter((t) => sameDay(new Date(t.due), now)).map(withLead);
  const upcoming = open.filter((t) => new Date(t.due) > now && !sameDay(new Date(t.due), now)).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 10).map(withLead);
  const doneToday = d.tasks.filter((t) => t.done && t.doneAt && sameDay(new Date(t.doneAt), now)).length;
  const openLeads = d.leads.filter((l) => !CLOSED.includes(l.stage));
  const neverCalled = openLeads.filter((l) => !l.interactions.some((i) => i.type === 'call'));
  const hot = openLeads.filter((l) => unitsForLead(l, d.inventory, { limit: 1, min: 85 }).length);
  let play = 'Inbox is clear. Work the hot matches and add fresh inventory.';
  if (overdue.length) play = `Clear ${overdue.length} overdue follow-up${overdue.length > 1 ? 's' : ''} first. They already waited.`;
  else if (hot.length) play = `${hot.length} lead${hot.length > 1 ? 's have' : ' has'} an 85+ match. Pitch them before anything else.`;
  else if (neverCalled.length) play = `${neverCalled.length} lead${neverCalled.length > 1 ? 's have' : ' has'} never been called. Qualify model, hours, budget, timing.`;
  res.json({
    counts: { overdue: overdue.length, dueToday: dueToday.length, neverCalled: neverCalled.length, hot: hot.length, doneToday },
    overdue, dueToday, upcoming,
    neverCalled: neverCalled.slice(0, 8),
    hot: hot.slice(0, 8).map((l) => ({ ...l, bestMatch: unitsForLead(l, d.inventory, { limit: 1, min: 85 })[0] })).map((l) => ({
      id: l.id, firstName: l.firstName, lastName: l.lastName, company: l.company, score: l.bestMatch.score,
      unit: [l.bestMatch.unit.year, l.bestMatch.unit.make, l.bestMatch.unit.model].join(' '), unitId: l.bestMatch.unit.id,
    })),
    play,
  });
}));

// ---------- stats ----------
app.get('/api/stats', wrap((req, res) => {
  const d = db();
  const byStage = {};
  for (const s of STAGES) {
    const items = d.leads.filter((l) => l.stage === s);
    byStage[s] = { count: items.length, value: items.reduce((a, l) => a + (l.budgetMax || 0), 0) };
  }
  const liveUnits = d.inventory.filter((u) => u.status === 'Live');
  const units = d.inventory.map(withDerived);
  const margins = units.filter((u) => u.margin != null && u.status !== 'Sold');
  const hotUnits = d.inventory.filter((u) => u.status !== 'Sold')
    .map((u) => ({ id: u.id, stock: u.stock, title: [u.year, u.make, u.model].join(' '), status: u.status, buyers: topBuyers(u, d.leads, { limit: 99, min: 60 }).length, top: topBuyers(u, d.leads, { limit: 1 })[0]?.score || 0 }))
    .sort((a, b) => b.top - a.top || b.buyers - a.buyers).slice(0, 6);
  res.json({
    leads: d.leads.length,
    units: d.inventory.length,
    live: liveUnits.length,
    draft: d.inventory.filter((u) => u.status === 'Draft').length,
    sold: d.inventory.filter((u) => u.status === 'Sold').length,
    liveValue: liveUnits.reduce((a, u) => a + (u.listPrice || u.askPrice || 0), 0),
    pipelineValue: d.leads.filter((l) => !CLOSED.includes(l.stage)).reduce((a, l) => a + (l.budgetMax || 0), 0),
    potentialMargin: margins.reduce((a, u) => a + u.margin, 0),
    pendingUnits: units.filter((u) => u.pendingFields.length && u.status !== 'Sold').length,
    byStage, hotUnits,
  });
}));

app.get('/api/config', (req, res) => res.json({ ...config, stages: STAGES }));

// Settings admin: whitelisted, validated fields only. Written to config.json and applied live (pitch, brochure, UI).
const SETTINGS_FIELDS = {
  company: { max: 80, required: true }, agent: { max: 60, required: true }, hq: { max: 80 }, address: { max: 80 },
  phone: { max: 30 }, mobile: { max: 30 }, email: { max: 120, email: true }, web: { max: 120 },
  authority: { max: 120 }, established: { max: 120 }, services: { max: 120 }, closing: { max: 600 },
};
const saveConfig = wrap((req, res) => {
  const b = req.body || {};
  const next = {};
  for (const [k, rule] of Object.entries(SETTINGS_FIELDS)) {
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim();
    if (rule.required && !v) throw fail(400, `${k} is required`);
    if (v.length > rule.max) throw fail(400, `${k} is too long (max ${rule.max})`);
    if (rule.email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw fail(400, 'email is not a valid address');
    next[k] = v;
  }
  if (b.goldHex !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(String(b.goldHex))) throw fail(400, 'gold must be a hex color like #FFC400');
    next.goldHex = String(b.goldHex).toUpperCase();
  }
  if (b.density !== undefined) {
    if (!['standard', 'compact'].includes(b.density)) throw fail(400, 'density must be standard or compact');
    next.density = b.density;
  }
  Object.assign(config, next);
  const { stages, ...persist } = config;
  const file = path.join(__dirname, 'config.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(persist, null, 2) + '\n'); // write-then-rename so a crash can't leave half a file
  fs.renameSync(file + '.tmp', file);
  res.json({ success: true, ...config, stages: STAGES });
});
app.post('/api/config', saveConfig);
app.put('/api/config', saveConfig);

// Unknown API routes get JSON, not the HTML error page.
app.use('/api', (req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl.split('?')[0]}` }));

// Serve built frontend in production
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Last-resort error handler: JSON for the API (malformed request bodies are the caller's fault, 400), no stack traces to clients.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 400 && err.type ? 'Request body is not valid JSON' : status >= 500 ? 'Internal server error' : err.message });
});

if (require.main === module) {
  store.get(); // fail fast at startup if the data file is unreadable
  // There is no login, so listen on this computer only. Set HOST=0.0.0.0 to share on your network (trusted networks only).
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => console.log(`BAM CRM server running on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`));
}
module.exports = app;
