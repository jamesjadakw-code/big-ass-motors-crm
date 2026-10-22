// Google Workspace connection: OAuth (one-time sign-in as the sender mailbox) + Gmail drafts.
// Only the gmail.compose scope is requested: it can create drafts. Secrets live in server/.env (never sent to the browser);
// the refresh token is stored in server/data/google-token.json. Endpoints are overridable so tests can use a mock Gmail.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildMime, base64url } = require('./mime');

// Tiny .env reader (KEY=VALUE, # comments, optional quotes). Real environment variables win.
function loadEnvFile() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch { /* no .env yet */ }
}
loadEnvFile();

const cfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  sender: (process.env.GOOGLE_SENDER || 'sales@bigassmotors.com').toLowerCase(),
  redirect: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/api/google/callback`,
  authUrl: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  apiBase: process.env.GOOGLE_API_BASE || 'https://gmail.googleapis.com',
  mailBase: process.env.GOOGLE_MAIL_BASE || 'https://mail.google.com',
});

const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const TOKEN_FILE = () => process.env.BAM_GOOGLE_TOKEN || path.join(__dirname, 'data', 'google-token.json');
const RETURN_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000', 'http://127.0.0.1:4000'];
const pending = new Map(); // oauth state -> { returnTo, expires }

class GoogleError extends Error {
  constructor(message, code, status = 400) { super(message); this.code = code; this.status = status; }
}

const readToken = () => { try { return JSON.parse(fs.readFileSync(TOKEN_FILE(), 'utf8')); } catch { return null; } };
function writeToken(t) {
  fs.mkdirSync(path.dirname(TOKEN_FILE()), { recursive: true });
  fs.writeFileSync(TOKEN_FILE() + '.tmp', JSON.stringify(t, null, 2), { mode: 0o600 });
  fs.renameSync(TOKEN_FILE() + '.tmp', TOKEN_FILE());
}

const isConfigured = () => !!(cfg().clientId && cfg().clientSecret);

function status() {
  const c = cfg();
  const t = readToken();
  return {
    configured: isConfigured(),
    connected: !!(t && t.refresh_token),
    email: t ? t.email : null,
    sender: c.sender,
    redirectUri: c.redirect,
  };
}

function authUrl(returnTo) {
  const c = cfg();
  if (!isConfigured()) throw new GoogleError('Google is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env (see GOOGLE-SETUP.md).', 'GOOGLE_NOT_CONFIGURED', 409);
  const state = crypto.randomBytes(24).toString('hex');
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  pending.set(state, { returnTo: RETURN_ORIGINS.includes(returnTo) ? returnTo : null, expires: Date.now() + 10 * 60 * 1000 });
  const q = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirect, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', login_hint: c.sender, state,
  });
  return `${c.authUrl}?${q}`;
}

async function tokenRequest(params) {
  const c = cfg();
  const r = await fetch(c.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new GoogleError(j.error_description || j.error || `Google token request failed (${r.status})`, j.error === 'invalid_grant' ? 'GOOGLE_AUTH_EXPIRED' : 'GOOGLE_TOKEN_ERROR', j.error === 'invalid_grant' ? 401 : 502);
  return j;
}

async function handleCallback(code, state) {
  const c = cfg();
  const s = pending.get(state);
  pending.delete(state);
  if (!s || s.expires < Date.now()) throw new GoogleError('This sign-in link expired or was not started here. Click Connect Google again.', 'GOOGLE_BAD_STATE');
  if (!code) throw new GoogleError('Google did not return an authorization code.', 'GOOGLE_NO_CODE');
  const tok = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: c.redirect });
  if (!tok.refresh_token) throw new GoogleError('Google did not issue a refresh token. Remove the app at myaccount.google.com/permissions and connect again.', 'GOOGLE_NO_REFRESH');
  const email = await profileEmail(tok.access_token);
  if (email.toLowerCase() !== c.sender) {
    throw new GoogleError(`Signed in as ${email}, but drafts must come from ${c.sender}. Sign in with the ${c.sender} account.`, 'GOOGLE_WRONG_ACCOUNT');
  }
  writeToken({ refresh_token: tok.refresh_token, access_token: tok.access_token, expiry: Date.now() + (tok.expires_in || 3600) * 1000, email });
  return { email, returnTo: s.returnTo };
}

async function profileEmail(accessToken) {
  const r = await fetch(`${cfg().apiBase}/gmail/v1/users/me/profile`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.emailAddress) throw new GoogleError('Could not read the Google account that signed in.', 'GOOGLE_PROFILE_ERROR', 502);
  return j.emailAddress;
}

async function accessToken() {
  const t = readToken();
  if (!t || !t.refresh_token) throw new GoogleError('Google is not connected. Click Connect Google first.', 'GOOGLE_NOT_CONNECTED', 409);
  if (t.access_token && t.expiry > Date.now() + 60 * 1000) return t.access_token;
  const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  writeToken({ ...t, access_token: tok.access_token, expiry: Date.now() + (tok.expires_in || 3600) * 1000 });
  return tok.access_token;
}

// Creates one draft in the connected mailbox. Returns { draftId, messageId, composeUrl }.
async function createDraft({ to, subject, text, attachments }) {
  const c = cfg();
  const t = readToken();
  const token = await accessToken();
  const raw = base64url(buildMime({ from: t.email || c.sender, to, subject, text, attachments }));
  const r = await fetch(`${c.apiBase}/gmail/v1/users/me/drafts`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }), signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new GoogleError('Google rejected the saved sign-in. Connect Google again.', 'GOOGLE_AUTH_EXPIRED', 401);
  if (!r.ok) throw new GoogleError((j.error && j.error.message) || `Gmail error ${r.status}`, 'GMAIL_ERROR', r.status === 429 ? 429 : 502);
  const messageId = j.message && j.message.id;
  return {
    draftId: j.id,
    messageId,
    composeUrl: `${c.mailBase}/mail/?authuser=${encodeURIComponent(t.email || c.sender)}#drafts?compose=${encodeURIComponent(messageId)}`,
  };
}

function disconnect() {
  try { fs.unlinkSync(TOKEN_FILE()); } catch { /* already gone */ }
}

module.exports = { status, authUrl, handleCallback, createDraft, disconnect, isConfigured, GoogleError };
