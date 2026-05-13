import crypto from 'node:crypto';

// Short URL-safe ids for servers/channels/categories/messages. 8 bytes ~=
// 64 bits of entropy, encoded as 11-character base64url. Safe to embed in
// URLs and chat cards.
export function uid() {
  return crypto.randomBytes(8).toString('base64url');
}

// Public-facing invite keys for servers. Keep them readable so users can
// type one in. Format: "ORB-XXXXX-XXXXX" with crockford-base32 alphabet
// (no I/L/O/U for OCR/typing safety).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function block(n) {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}
export function inviteKey() {
  return 'ORB-' + block(5) + '-' + block(5);
}
