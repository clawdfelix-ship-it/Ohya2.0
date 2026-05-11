const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('verifyShipanySignature: accepts valid hex hmac', () => {
  const { verifyShipanySignature } = require('../utils/webhookSignatures');
  const secret = 's3cr3t';
  const rawBody = Buffer.from('{"a":1,"b":2}', 'utf8');
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyShipanySignature({ secret, rawBody, headerValue: sig }), true);
});

test('verifyShipanySignature: rejects invalid signature', () => {
  const { verifyShipanySignature } = require('../utils/webhookSignatures');
  assert.equal(
    verifyShipanySignature({ secret: 's3cr3t', rawBody: Buffer.from('{"x":1}'), headerValue: 'deadbeef' }),
    false
  );
});

