// Stand-in for Google (OAuth + Gmail drafts) for trying the bulk-pitch feature without a real account.
// Usage: node google-mock.js [port=4200]
// Then start the CRM with: GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y GOOGLE_AUTH_URL=http://localhost:4200/auth
//   GOOGLE_TOKEN_URL=http://localhost:4200/token GOOGLE_API_BASE=http://localhost:4200 node index.js
const http = require('http');
const port = Number(process.argv[2] || 4200);
const drafts = [];

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/auth') { res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}?code=good-code&state=${u.searchParams.get('state')}` }); return res.end(); }
    if (u.pathname === '/token') return json(200, { access_token: 'mock-access', refresh_token: 'mock-refresh', expires_in: 3600 });
    if (u.pathname === '/gmail/v1/users/me/profile') return json(200, { emailAddress: 'sales@bigassmotors.com' });
    if (u.pathname === '/gmail/v1/users/me/drafts' && req.method === 'POST') { drafts.push(JSON.parse(body)); return json(200, { id: 'd' + drafts.length, message: { id: 'm' + drafts.length } }); }
    if (u.pathname === '/_count') return json(200, { drafts: drafts.length });
    json(404, { error: { message: 'mock: ' + u.pathname } });
  });
}).listen(port, () => console.log(`mock Google on :${port}`));
