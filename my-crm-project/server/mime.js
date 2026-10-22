// Builds an RFC 5322 / MIME message (text body + PDF attachments) for the Gmail drafts API.
const crypto = require('crypto');

const CRLF = '\r\n';
const wrap76 = (b64) => b64.replace(/(.{76})/g, '$1' + CRLF);
const b64 = (buf) => wrap76(Buffer.from(buf).toString('base64'));

// Header values may never contain line breaks (header injection).
function clean(v, what) {
  const s = String(v ?? '').trim();
  if (/[\r\n]/.test(s)) throw new Error(`${what} must not contain line breaks`);
  return s;
}

const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
// RFC 2047 encoded-word so accents (Spanish subjects) survive. Chunked so no line exceeds the 75-char limit.
function encodeHeader(s) {
  if (isAscii(s)) return s;
  const bytes = Buffer.from(s, 'utf8');
  const words = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 36, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 character
    words.push(`=?UTF-8?B?${bytes.slice(start, end).toString('base64')}?=`);
    start = end;
  }
  return words.join(CRLF + ' ');
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
function address(v, what) {
  const a = clean(v, what);
  if (!EMAIL.test(a)) throw new Error(`${what} is not a valid email address`);
  return a;
}

// Safe attachment file name: ASCII letters, digits, dot, dash, underscore only.
const safeName = (n) => String(n || 'file').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._]+/, '').slice(0, 80) || 'file';

function buildMime({ from, to, subject, text, attachments = [] }) {
  const boundary = '=_bam_' + crypto.randomBytes(12).toString('hex');
  const head = [
    `From: ${address(from, 'from')}`,
    `To: ${address(to, 'to')}`,
    `Subject: ${encodeHeader(clean(subject, 'subject'))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(String(text ?? '')),
  ];
  for (const a of attachments) {
    const name = safeName(a.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.type || 'application/octet-stream'}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      b64(a.buffer),
    );
  }
  parts.push(`--${boundary}--`, '');
  return head.join(CRLF) + CRLF + CRLF + parts.join(CRLF);
}

const base64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = { buildMime, base64url, safeName, encodeHeader };
