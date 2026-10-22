// End-to-end API checks. Usage: BAM_DB=<temp file> PORT=4100 node index.js   then   node api-test.js [baseUrl]
const B = process.argv[2] || 'http://localhost:4100';
let pass = 0;
const fails = [];

async function call(method, url, body, raw) {
  const res = await fetch(B + '/api' + url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const check = (name, ok, extra = '') => { if (ok) pass++; else { fails.push(name + (extra ? ` -> ${extra}` : '')); console.log('FAIL', name, extra); } };

(async () => {
  // ---- read endpoints
  for (const p of ['/config', '/today', '/stats', '/leads', '/inventory', '/tasks']) {
    const r = await call('GET', p);
    check(`GET ${p} 200 json`, r.status === 200 && r.json !== null, r.status + ' ' + r.text.slice(0, 80));
  }
  const cfg = (await call('GET', '/config')).json;
  check('config has company/phone/agent/closing', cfg.company && 'phone' in cfg && cfg.agent && cfg.closing);
  const inv0 = (await call('GET', '/inventory')).json;
  const leads0 = (await call('GET', '/leads')).json;
  check('seed has inventory and leads', inv0.length >= 6 && leads0.length >= 8, `${inv0.length}/${leads0.length}`);

  // ---- leads CRUD + validation
  let r = await call('POST', '/leads', { firstName: 'Test', lastName: 'Buyer', email: '  TeSt@Example.COM ', phone: '(555) 123-4567', city: 'Dallas', state: 'tx', budgetMax: 150000, wants: { make: 'Vermeer', category: 'HDD Drill', model: 'D24x40' } });
  check('create lead 201', r.status === 201 && r.json.created, r.text.slice(0, 120));
  const lead = r.json.lead;
  check('email normalized, state uppercased', lead.email === 'test@example.com' && lead.state === 'TX', JSON.stringify([lead.email, lead.state]));
  r = await call('POST', '/leads', { firstName: 'Dup', email: 'test@example.com' });
  check('dup email merges (200, same id)', r.status === 200 && r.json.merged && r.json.lead.id === lead.id, r.text.slice(0, 100));
  r = await call('POST', '/leads', { firstName: 'Phone', phone: '555.123.4567' });
  check('phone-only dedupe', r.json && r.json.lead && r.json.lead.id === lead.id, r.text.slice(0, 100));
  r = await call('POST', '/leads', { email: 'x@y.com' });
  check('no name/company -> 400', r.status === 400, r.status);
  r = await call('POST', '/leads', { firstName: 'NoContact' });
  check('no email/phone -> 400', r.status === 400, r.status);
  r = await call('POST', '/leads', { firstName: 'Neg', email: 'neg@x.com', budgetMax: -5 });
  check('negative budget -> 400', r.status === 400, r.status);
  r = await call('POST', '/leads', { firstName: 'BadStage', email: 'bs@x.com', stage: 'Nope' });
  check('bad stage -> 400', r.status === 400, r.status);
  r = await call('POST', '/leads', '{bad json');
  check('malformed JSON -> 400 JSON', r.status === 400 && r.json && r.json.error, r.status + ' ' + r.text.slice(0, 60));
  r = await call('PUT', `/leads/${lead.id}`, { city: 'Austin', stage: 'Qualified' });
  check('PUT lead persists', r.status === 200 && r.json.city === 'Austin' && r.json.stage === 'Qualified');
  r = await call('PUT', `/leads/${lead.id}`, { email: leads0[0].email });
  check('PUT to another lead\'s email -> 409', r.status === 409, r.status);
  r = await call('GET', `/leads/${lead.id}`);
  check('GET lead by id', r.status === 200 && r.json.city === 'Austin');
  r = await call('GET', '/leads/nope');
  check('GET missing lead 404', r.status === 404);
  r = await call('GET', '/leads?q=austin&stage=Qualified');
  check('search+stage filter', r.json.some((l) => l.id === lead.id));

  // ---- CSV import
  r = await call('POST', '/leads/import', { csv: 'first_name,last_name,email,phone,make,model,budget_max\nCsv,One,csv1@x.com,,Vermeer,D24x40,150000\nCsv,Dup, CSV1@x.com ,,Vermeer,D24x40,150000\nBad,NoContact,,,,,\n' });
  check('csv: 1 created, 1 merged, 1 skipped', r.json && r.json.created === 1 && r.json.merged === 1 && r.json.skipped.length === 1, r.text.slice(0, 160));
  r = await call('POST', '/leads/import', { csv: '' });
  check('csv empty -> 400', r.status === 400, r.status);
  r = await call('POST', '/leads/import', { csv: 'foo,bar\n1,2\n' });
  check('csv unknown columns -> skipped rows not crash', r.status === 200 && r.json.skipped.length === 1, r.text.slice(0, 120));
  r = await call('POST', '/leads/import', {});
  check('import without payload -> 400', r.status === 400);

  // ---- calls / interactions / tasks
  r = await call('POST', `/leads/${lead.id}/calls`, { note: 'Quiere el equipo para marzo' });
  check('call logs, Spanish detected', r.status === 200 && r.json.language === 'es' && /Hola/.test(r.json.draft), r.text.slice(0, 100));
  const due = new Date(r.json.task.due);
  check('follow-up is a weekday at 10:00 local', due.getHours() === 10 && due.getMinutes() === 0 && ![0, 6].includes(due.getDay()) && due > new Date(), due.toString());
  r = await call('POST', `/leads/${lead.id}/calls`, { note: '  ' });
  check('empty call note -> 400', r.status === 400);
  r = await call('POST', `/leads/${lead.id}/interactions`, { type: 'text', unitId: inv0[0].id, note: 'x' });
  check('interaction text logs + marks match pitched', r.status === 200);
  const tasks = (await call('GET', '/tasks')).json;
  const t = tasks.find((x) => x.leadId === lead.id);
  check('auto task exists with lead attached', t && t.lead && t.lead.id === lead.id);
  r = await call('PUT', `/tasks/${t.id}`, { done: true });
  check('task complete', r.status === 200 && r.json.done === true);
  r = await call('POST', '/tasks', { title: 'Manual task', leadId: lead.id });
  check('create task default due', r.status === 201 && new Date(r.json.due) > new Date());
  const t2 = r.json;
  r = await call('POST', '/tasks', { title: '' });
  check('blank task -> 400', r.status === 400);
  r = await call('POST', '/tasks', { title: 'x', due: 'garbage' });
  check('bad due -> 400', r.status === 400, r.status);
  r = await call('DELETE', `/tasks/${t2.id}`);
  check('delete task', r.status === 200);

  // ---- inventory CRUD + matching + pdf
  r = await call('POST', '/inventory', { year: 2018, make: 'Vermeer', model: 'D24x40 S3', category: 'HDD Drill', hours: 1900, hp: 130, askPrice: 140000, buyPrice: 120000, listPrice: '', city: 'Houston', state: 'tx', serial: 'SN123456' });
  check('create unit 201 w/ stock', r.status === 201 && /^BAM-\d+/.test(r.json.stock), r.text.slice(0, 120));
  const unit = r.json;
  check('unit margin computed from ask-buy', unit.margin === 20000, String(unit.margin));
  r = await call('POST', '/inventory', { year: 2020 });
  check('unit without make/model -> 400', r.status === 400);
  r = await call('POST', '/inventory', { make: 'X', hours: -1 });
  check('negative hours -> 400', r.status === 400);
  r = await call('PUT', `/inventory/${unit.id}`, { status: 'Live', hours: 2000 });
  check('PUT unit', r.status === 200 && r.json.status === 'Live' && r.json.hours === 2000);
  r = await call('PUT', `/inventory/${unit.id}`, { status: 'Bogus' });
  check('bad unit status -> 400', r.status === 400);
  r = await call('GET', `/inventory/${unit.id}/matches`);
  const mine = r.json.find((m) => m.lead.id === lead.id);
  check('new unit matches new lead (score>=80)', mine && mine.score >= 80, JSON.stringify(r.json.map((m) => [m.lead.firstName, m.score])));
  check('pitch never leaks ask/buy price', r.json.every((m) => !/140,?000|120,?000|140000|120000/.test(JSON.stringify(m.pitch))), '');
  r = await call('POST', '/matches/status', { leadId: lead.id, unitId: unit.id, status: 'dismissed' });
  check('match status saves', r.status === 200 && r.json.status === 'dismissed');
  r = await call('POST', '/matches/status', { leadId: lead.id, unitId: unit.id, status: 'zzz' });
  check('match bad status -> 400', r.status === 400);
  r = await call('GET', `/leads/${lead.id}/matches`);
  check('lead matches endpoint', r.status === 200 && Array.isArray(r.json) && r.json.length > 0, r.text.slice(0, 100));

  const pdf = await call('GET', `/inventory/${unit.id}/brochure.pdf`, undefined, true);
  const buf = Buffer.from(await pdf.arrayBuffer());
  check('brochure is a PDF', pdf.status === 200 && buf.slice(0, 5).toString() === '%PDF-' && buf.length > 3000, `${pdf.status} ${buf.length}b`);
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'bam-test-brochure.pdf'), buf);
  r = await call('GET', '/inventory/nope/brochure.pdf');
  check('brochure for missing unit -> 404', r.status === 404, r.status);

  // ---- ingest
  r = await call('POST', '/ingest/parse', { text: '2018 Vermeer D60x90 HDD $385,000 4,000 hours Listed in Dallas, TX serial: ABC1234567', url: 'https://x.com/1', images: ['https://i.com/a.jpg', 'bad'] });
  check('ingest parse extracts fields', r.status === 200 && r.json.fields.year === 2018 && r.json.fields.hours === 4000 && r.json.fields.state === 'TX' && r.json.fields.media.length === 1, r.text.slice(0, 200));
  r = await call('POST', '/ingest/parse', { text: '' });
  check('ingest empty -> 400', r.status === 400);
  r = await call('POST', '/ingest/pull', { url: 'http://localhost:4000/' });
  check('pull blocks localhost', r.status === 400, r.status);
  r = await call('POST', '/ingest/pull', { url: 'http://127.0.0.1/' });
  check('pull blocks 127.x', r.status === 400);
  r = await call('POST', '/ingest/pull', { url: 'http://192.168.1.1/' });
  check('pull blocks private LAN', r.status === 400);
  r = await call('POST', '/ingest/pull', { url: 'ftp://x' });
  check('pull rejects non-http', r.status === 400);

  // ---- dashboards
  const today = (await call('GET', '/today')).json;
  check('today has counts + play', today.counts && typeof today.play === 'string');
  const stats = (await call('GET', '/stats')).json;
  check('stats totals', stats.leads >= 8 && stats.units >= 7 && stats.byStage && Array.isArray(stats.hotUnits));

  // ---- config (restores original afterwards)
  r = await call('POST', '/config', { phone: '904-000-0000', agent: 'Tester' });
  check('POST config saves', r.status === 200, r.text.slice(0, 100));
  r = await call('GET', '/config');
  check('config change visible', r.json.agent === 'Tester');
  r = await call('POST', '/config', { goldHex: 'not-a-color' });
  check('bad goldHex rejected', r.status === 400, r.status + ' ' + r.text.slice(0, 80));
  r = await call('POST', '/config', { density: 'giant' });
  check('bad density rejected', r.status === 400, r.status);
  r = await call('POST', '/config', { evil: '<script>', company: 'x'.repeat(5000) });
  check('config ignores unknown / oversize', r.status === 400 || (r.json && !r.json.evil), r.status + ' ' + r.text.slice(0, 80));

  // put the real settings back (this suite edits them through the API)
  const { stages, success, ...origKeep } = cfg;
  r = await call('POST', '/config', origKeep);
  check('config restored to original', r.status === 200 && (await call('GET', '/config')).json.phone === cfg.phone, r.text.slice(0, 80));

  // ---- deletes cascade
  r = await call('DELETE', `/leads/${lead.id}`);
  check('delete lead', r.status === 200);
  const after = (await call('GET', '/tasks')).json;
  check('lead tasks removed with lead', !after.some((x) => x.leadId === lead.id));
  r = await call('DELETE', `/inventory/${unit.id}`);
  check('delete unit', r.status === 200);
  r = await call('GET', '/nope');
  check('unknown /api route is JSON 404, not HTML', r.status === 404 && r.json !== null, r.status + ' ' + r.text.slice(0, 60));

  console.log(`\n${pass} passed, ${fails.length} failed`);
  fails.forEach((f) => console.log(' -', f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
