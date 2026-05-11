const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCorsOptions } = require('../utils/security/cors');

test('cors allowlist: prod blocks unknown origin', () => {
  const opt = buildCorsOptions({ nodeEnv: 'production', allowedOriginsEnv: 'https://example.com' });
  opt.origin('https://evil.com', (err, ok) => {
    assert.equal(err, null);
    assert.equal(ok, false);
  });
});

test('cors allowlist: prod allows configured origin', () => {
  const opt = buildCorsOptions({ nodeEnv: 'production', allowedOriginsEnv: 'https://example.com' });
  opt.origin('https://example.com', (err, ok) => {
    assert.equal(err, null);
    assert.equal(ok, true);
  });
});

test('cors allowlist: dev allows localhost', () => {
  const opt = buildCorsOptions({ nodeEnv: 'development', allowedOriginsEnv: '' });
  opt.origin('http://localhost:5173', (err, ok) => {
    assert.equal(err, null);
    assert.equal(ok, true);
  });
});

