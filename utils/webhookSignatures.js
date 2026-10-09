const crypto = require('node:crypto');

function normalizeHexSignature(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.startsWith('sha256=')) return s.slice('sha256='.length);
  return s;
}

function timingSafeEqualHex(aHex, bHex) {
  if (!aHex || !bHex) return false;
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function timingSafeEqualText(aText, bText) {
  const a = String(aText || '');
  const b = String(bText || '');
  if (!a || !b) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyShipanySignature({ secret, rawBody, headerValue }) {
  if (!secret) return false;
  if (!rawBody || !Buffer.isBuffer(rawBody)) return false;
  const provided = normalizeHexSignature(headerValue);
  if (!provided) return false;
  const expected = crypto.createHmac('sha256', String(secret)).update(rawBody).digest('hex');
  return timingSafeEqualHex(provided, expected);
}

function hasValidSharedSecret({ expectedSecret, providedSecret }) {
  return timingSafeEqualText(expectedSecret, providedSecret);
}

module.exports = { verifyShipanySignature, hasValidSharedSecret };
