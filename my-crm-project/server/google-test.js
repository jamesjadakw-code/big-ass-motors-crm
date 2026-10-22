// End-to-end test of the Google connection + bulk pitch drafts against a MOCK Google (no real account, no network).
// Usage: node google-test.js      (starts its own mock on :4200 and CRM server on :4201 with throwaway data)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const MOCK = 4200, CRM = 4201;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bam-g-'));
let pass = 0; const fails = [];
const check = (name, ok, extra = '') => { if (ok) pass++; else { fails.push(name + (extra ? ' -> ' + extra : '')); console.log('FAIL', name, extra); } };

// ---------------- mock Google ----------------
const mock = { drafts: [], accountEmail: 'sales@bigassmotors.com', failTo: null, expire: false, tokenCalls: [] };
const mockServer = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${MOCK}`);
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (u.pathname === '/auth') { // consent screen stand-in: approves immediately
      res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}?code=good-code&state=${u.searchParams.get('state')}` });
      return res.end();
    }
    if (u.pathname === '/token') {
      const p = new URLSearchParams(body); mock.tokenCalls.push(p.get('grant_type'));
      if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'good-code' ? json(200, { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
      if (p.get('grant_type') === 'refresh_token') return mock.expire ? json(400, { error: 'invalid_grant', error_description: 'Token revoked' }) : json(200, { access_token: 'acc-2', expires_in: 3600 });
      return json(400, { error: 'unsupported_grant_type' });
    }
    if ((req.headers.authorization || '').indexOf('Bearer ') !== 0) return json(401, { error: { message: 'no token' } });
    if (u.pathname === '/gmail/v1/users/me/profile') return json(200, { emailAddress: mock.accountEmail });
    if (u.pathname === '/gmail/v1/users/me/drafts' && req.method === 'POST') {
      if (mock.expire) return json(401, { error: { message: 'expired' } });
      const raw = Buffer.from(JSON.parse(body).message.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (mock.failTo && raw.includes('To: ' + mock.failTo)) return json(500, { error: { message: 'mock Gmail exploded' } });
      mock.drafts.push(raw);
      return json(200, { id: 'r' + mock.drafts.length, message: { id: 'm' + mock.drafts.length, threadId: 't' + mock.drafts.length } });
    }
    json(404, { error: { message: 'mock: ' + u.pathname } });
  });
});

// ---------------- helpers ----------------
function startCrm(extraEnv, port = CRM) {
  const env = { ...process.env, PORT: String(port), BAM_DB: path.join(tmp, `db-${port}.json`), BAM_GOOGLE_TOKEN: path.join(tmp, `tok-${port}.json`),
    GOOGLE_AUTH_URL: `http://localhost:${MOCK}/auth`, GOOGLE_TOKEN_URL: `http://localhost:${MOCK}/token`, GOOGLE_API_BASE: `http://localhost:${MOCK}`, GOOGLE_MAIL_BASE: 'https://mail.google.com',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', ...extraEnv };
  const p = spawn(process.execPath, ['index.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d)); p.stderr.on('data', (d) => (p.log += d));
  return p;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(port, method, url, body, opts = {}) {
  const r = await fetch(`http://localhost:${port}/api${url}`, { method, redirect: 'manual', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* html/redirect */ }
  return { status: r.status, json: j, text, headers: r.headers };
}
function pyParse(raw) { // decode with Python's strict email parser: independent check that the MIME is valid
  const r = spawnSync('python', ['-I', '-c', `
import sys,email,email.policy,json
m=email.message_from_bytes(sys.stdin.buffer.read(), policy=email.policy.default)
atts=[(p.get_filename(),p.get_content_type(),len(p.get_content())) for p in m.iter_attachments()]
body=m.get_body(preferencelist=('plain',)).get_content()
open(sys.argv[1],'wb').write([p for p in m.iter_attachments()][0].get_content()) if atts else None
print(json.dumps({'from':str(m['From']),'to':str(m['To']),'subject':str(m['Subject']),'atts':atts,'body':body}))`, path.join(tmp, 'att.pdf')], { input: raw, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('python parse failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}
function pdfText(file) {
  const r = spawnSync('python', ['-I', '-c', 'import pypdf,sys;print(" ".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', file], { encoding: 'utf8' });
  return r.stdout;
}

(async () => {
  await new Promise((r) => mockServer.listen(MOCK, r));

  // ===== A. not configured =====
  let crm = startCrm({}, 4202); await wait(1500);
  let r = await api(4202, 'GET', '/google/status');
  check('unconfigured: status.configured false', r.json && r.json.configured === false && r.json.connected === false, r.text);
  let inv = (await api(4202, 'GET', '/inventory')).json; let leads = (await api(4202, 'GET', '/leads')).json;
  r = await api(4202, 'POST', '/pitch/bulk', { unitId: inv[0].id, leadIds: [leads[0].id] });
  check('unconfigured: bulk -> 409 GOOGLE_NOT_CONFIGURED', r.status === 409 && r.json.code === 'GOOGLE_NOT_CONFIGURED', r.text);
  r = await fetch(`http://localhost:4202/api/google/connect`, { redirect: 'manual' });
  check('unconfigured: connect shows a message, not a crash', r.status === 409, String(r.status));
  crm.kill();

  // ===== B. configured =====
  crm = startCrm({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' }); await wait(1500);
  r = await api(CRM, 'GET', '/google/status');
  check('configured but not connected', r.json.configured && !r.json.connected && r.json.sender === 'sales@bigassmotors.com', r.text);
  check('status never leaks secrets', !/sec|cid|refresh|ref-1/.test(r.text.replace('sales@bigassmotors.com', '')), r.text);
  inv = (await api(CRM, 'GET', '/inventory')).json; leads = (await api(CRM, 'GET', '/leads')).json;
  const unit = inv.find((u) => /RTX1250/.test(u.model)) || inv[0];
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [leads[0].id] });
  check('not connected: bulk -> 409 GOOGLE_NOT_CONNECTED', r.status === 409 && r.json.code === 'GOOGLE_NOT_CONNECTED', r.text);

  // connect flow
  r = await fetch(`http://localhost:${CRM}/api/google/connect?returnTo=http://localhost:5173`, { redirect: 'manual' });
  const loc = new URL(r.headers.get('location'));
  check('connect redirects to Google consent', r.status === 302 && loc.origin === `http://localhost:${MOCK}` && loc.pathname === '/auth');
  check('consent asks only for gmail.compose + offline + login_hint', loc.searchParams.get('scope') === 'https://www.googleapis.com/auth/gmail.compose' && loc.searchParams.get('access_type') === 'offline' && loc.searchParams.get('login_hint') === 'sales@bigassmotors.com', loc.search);
  const state = loc.searchParams.get('state');
  check('state is long random', /^[a-f0-9]{48}$/.test(state));
  // bad state is rejected, nothing saved
  r = await fetch(`http://localhost:${CRM}/api/google/callback?code=good-code&state=forged`, { redirect: 'manual' });
  check('forged state rejected', r.headers.get('location').includes('google=error'), r.headers.get('location'));
  check('forged state saved nothing', !(await api(CRM, 'GET', '/google/status')).json.connected);
  // wrong Google account
  mock.accountEmail = 'someone.else@gmail.com';
  let c1 = await fetch(`http://localhost:${CRM}/api/google/connect`, { redirect: 'manual' });
  let consent = await fetch(c1.headers.get('location'), { redirect: 'manual' });
  let cb = await fetch(consent.headers.get('location'), { redirect: 'manual' });
  check('wrong account refused', cb.headers.get('location').includes('google=error') && decodeURIComponent(cb.headers.get('location')).includes('sales@bigassmotors.com'), cb.headers.get('location'));
  check('wrong account saved no token', !fs.existsSync(path.join(tmp, `tok-${CRM}.json`)));
  // right account, full flow, returns to the dev UI origin
  mock.accountEmail = 'sales@bigassmotors.com';
  c1 = await fetch(`http://localhost:${CRM}/api/google/connect?returnTo=http://localhost:5173`, { redirect: 'manual' });
  consent = await fetch(c1.headers.get('location'), { redirect: 'manual' });
  cb = await fetch(consent.headers.get('location'), { redirect: 'manual' });
  check('good sign-in returns to the UI', cb.headers.get('location') === 'http://localhost:5173/#/match?google=connected', cb.headers.get('location'));
  r = await api(CRM, 'GET', '/google/status');
  check('connected as sales@', r.json.connected && r.json.email === 'sales@bigassmotors.com', r.text);
  check('state is single-use', (await fetch(consent.headers.get('location'), { redirect: 'manual' })).headers.get('location').includes('google=error'));
  const tokFile = path.join(tmp, `tok-${CRM}.json`);
  check('refresh token stored server-side only', JSON.parse(fs.readFileSync(tokFile, 'utf8')).refresh_token === 'ref-1');

  // ===== C. bulk pitch =====
  const buyers = (await api(CRM, 'GET', `/inventory/${unit.id}/matches?limit=20&min=0`)).json.map((m) => m.lead);
  const withEmail = buyers.filter((l) => l.email).slice(0, 3);
  const noEmail = (await api(CRM, 'POST', '/leads', { firstName: 'No', lastName: 'Email', phone: '555-000-1111', wants: { make: 'Vermeer' } })).json.lead;
  const es = (await api(CRM, 'PUT', `/leads/${withEmail[0].id}`, { language: 'es', city: 'Medellín' })).json;
  const ids = [withEmail[0].id, withEmail[1].id, withEmail[2].id, noEmail.id, 'does-not-exist', withEmail[0].id];
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: ids });
  check('bulk 200', r.status === 200, r.text.slice(0, 200));
  check('3 drafts created, 2 failed, duplicate id ignored', r.json.created === 3 && r.json.failed === 2 && r.json.results.length === 5, JSON.stringify([r.json.created, r.json.failed, r.json.results.length]));
  check('failures explain themselves', r.json.results.find((x) => x.leadId === noEmail.id).reason.includes('No email') && r.json.results.find((x) => x.leadId === 'does-not-exist').reason.includes('not found'));
  const okRes = r.json.results.filter((x) => x.ok);
  check('each result has a Gmail compose link for sales@', okRes.every((x) => x.composeUrl.startsWith('https://mail.google.com/mail/?authuser=sales%40bigassmotors.com#drafts?compose=m')), okRes[0].composeUrl);
  check('mock received 3 drafts', mock.drafts.length === 3, String(mock.drafts.length));

  const parsed = mock.drafts.map(pyParse);
  check('MIME parses; From is sales@', parsed.every((p) => p.from === 'sales@bigassmotors.com'), parsed[0].from);
  check('To is each buyer', JSON.stringify(parsed.map((p) => p.to).sort()) === JSON.stringify(withEmail.map((l) => l.email).sort()), JSON.stringify(parsed.map((p) => p.to)));
  check('each has exactly one PDF attachment named per buyer', parsed.every((p) => p.atts.length === 1 && p.atts[0][1] === 'application/pdf' && /-feature-sheet\.pdf$/.test(p.atts[0][0]) && p.atts[0][2] > 3000), JSON.stringify(parsed.map((p) => p.atts)));
  check('attachment names differ per buyer', new Set(parsed.map((p) => p.atts[0][0])).size === 3);
  const esDraft = parsed.find((p) => p.to === withEmail[0].email);
  check('Spanish buyer gets accented subject decoded correctly', /ficha técnica/.test(esDraft.subject), esDraft.subject);
  check('Spanish buyer gets Spanish body', /Hola/.test(esDraft.body), esDraft.body.slice(0, 60));
  const enDraft = parsed.find((p) => p.to === withEmail[1].email);
  check('English buyer gets English body', /^Hi /.test(enDraft.body), enDraft.body.slice(0, 40));
  // personalized, buyer-safe PDF content
  pyParse(mock.drafts[1]); const t1 = pdfText(path.join(tmp, 'att.pdf'));
  const name1 = [withEmail[1].firstName, withEmail[1].lastName].filter(Boolean).join(' ').toUpperCase();
  check('PDF is personalized ("PREPARED FOR <buyer>")', t1.includes('PREPARED FOR ' + name1), t1.slice(0, 200));
  const secret = [String(unit.askPrice), unit.askPrice.toLocaleString('en-US'), String(unit.buyPrice), unit.buyPrice && unit.buyPrice.toLocaleString('en-US')].filter(Boolean);
  check('PDF and email never contain internal ask/buy price', !secret.some((s) => t1.includes(s) || mock.drafts[1].includes(s)) && !parsed.some((p) => secret.some((s) => p.body.includes(s))), secret.join(','));
  check('PDF does not contain serial', !(unit.serial && t1.includes(unit.serial)));
  // CRM bookkeeping
  const after = (await api(CRM, 'GET', `/leads/${withEmail[1].id}`)).json;
  check('lead history records the draft (not claimed as sent)', after.interactions.some((i) => /Gmail draft created/.test(i.note) && /not sent/.test(i.note)));
  const ms = (await api(CRM, 'GET', `/inventory/${unit.id}/matches?limit=20&min=0`)).json;
  check('match status = drafted for the 3', withEmail.every((l) => ms.find((m) => m.lead.id === l.id).status === 'drafted'));
  check('failed buyers not marked', ms.find((m) => m.lead.id === noEmail.id) === undefined || ms.find((m) => m.lead.id === noEmail.id).status === 'new');
  r = await api(CRM, 'POST', '/matches/status', { leadId: withEmail[0].id, unitId: unit.id, status: 'drafted' });
  check('API accepts drafted status', r.status === 200);

  // ===== D. validation =====
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: 'nope', leadIds: [withEmail[0].id] });
  check('unknown unit 404', r.status === 404);
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [] });
  check('empty selection 400', r.status === 400 && /at least one/i.test(r.json.error), r.text);
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: 'abc' });
  check('non-array 400', r.status === 400);
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: Array.from({ length: 26 }, (_, i) => 'id' + i) });
  check('more than 25 -> 400', r.status === 400 && /at most 25/.test(r.json.error), r.text);
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [{ $ne: 1 }, 5, null] });
  check('junk ids -> 400 not crash', r.status === 400, r.text);

  // ===== E. partial failure + header injection =====
  const evil = (await api(CRM, 'POST', '/leads', { firstName: 'Bad', email: 'victim@x.com', phone: '555-222-3333', wants: { make: 'Vermeer' } })).json.lead;
  const boom = (await api(CRM, 'POST', '/leads', { firstName: 'Boom', email: 'boom@x.com', wants: { make: 'Vermeer' } })).json.lead;
  mock.failTo = 'boom@x.com'; const before = mock.drafts.length;
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [boom.id, evil.id] });
  check('one Gmail failure does not stop the others', r.json.results[0].ok === false && /exploded/.test(r.json.results[0].reason) && r.json.results[1].ok === true && mock.drafts.length === before + 1, r.text.slice(0, 300));
  const bdone = (await api(CRM, 'GET', `/leads/${boom.id}`)).json;
  check('failed lead gets no "draft created" history', !bdone.interactions.some((i) => /Gmail draft created/.test(i.note)));
  mock.failTo = null;
  const inj = (await api(CRM, 'PUT', `/leads/${evil.id}`, { email: 'x@y.com' })).json; // normal edit; real injection attempt below goes straight to the module
  const { buildMime } = require('./mime');
  let threw = 0;
  for (const bad of [{ to: 'a@b.com\r\nBcc: attacker@evil.com' }, { subject: 'Hi\r\nBcc: attacker@evil.com' }, { to: 'not-an-email' }, { from: 'a@b.com\nX: y' }]) {
    try { buildMime({ from: 'sales@bigassmotors.com', to: 'a@b.com', subject: 's', text: 't', ...bad }); } catch { threw++; }
  }
  check('MIME builder rejects header injection / bad addresses (4/4)', threw === 4, String(threw));
  const mm = buildMime({ from: 'sales@bigassmotors.com', to: 'a@b.com', subject: 'x', text: 'y', attachments: [{ filename: '../../etc/pa"ss\r\nwd.pdf', type: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }] });
  check('attachment filename is sanitized', !/\.\.|etc\/|"ss|\r\nwd/.test(mm.split('filename=')[1].split('\r\n')[0]), mm.split('filename=')[1].split('\r\n')[0]);

  // ===== F. expired sign-in aborts cleanly =====
  const tk = JSON.parse(fs.readFileSync(tokFile, 'utf8')); tk.expiry = 0; fs.writeFileSync(tokFile, JSON.stringify(tk)); // force a refresh
  mock.expire = true;
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: withEmail.map((l) => l.id) });
  check('expired auth: every buyer reported failed with a reconnect message', r.status === 200 && r.json.created === 0 && r.json.results.every((x) => !x.ok && /Connect Google|revoked|expired/i.test(x.reason)), r.text.slice(0, 300));
  mock.expire = false;
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [withEmail[1].id] });
  check('after recovery the access token refreshes automatically', r.json.created === 1 && mock.tokenCalls.includes('refresh_token'), r.text.slice(0, 200));

  // ===== G. network protection =====
  r = await fetch(`http://localhost:${CRM}/api/leads`, { headers: { Origin: 'https://evil.example' } });
  check('foreign website origin gets no CORS permission', !r.headers.get('access-control-allow-origin'));
  r = await fetch(`http://localhost:${CRM}/api/leads`, { headers: { Origin: 'http://localhost:5173' } });
  check('own dev page origin is allowed', r.headers.get('access-control-allow-origin') === 'http://localhost:5173');
  const hostResp = await new Promise((resolve) => { const q = http.request({ host: '127.0.0.1', port: CRM, path: '/api/leads', headers: { Host: 'evil.example' } }, (x) => { x.resume(); resolve(x.statusCode); }); q.end(); });
  check('request with a foreign Host header refused (DNS rebinding)', hostResp === 403, String(hostResp));

  // ===== H. disconnect =====
  r = await api(CRM, 'POST', '/google/disconnect');
  check('disconnect clears the connection', r.json.connected === false && !fs.existsSync(tokFile));
  r = await api(CRM, 'POST', '/pitch/bulk', { unitId: unit.id, leadIds: [withEmail[0].id] });
  check('after disconnect bulk refuses', r.status === 409);

  crm.kill(); mockServer.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fails.length} failed`); fails.forEach((f) => console.log(' -', f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
