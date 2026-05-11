const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('rate limiting middleware is wired', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(s, /loginLimiter\(\)/);
  assert.match(s, /webhookLimiter\(\)/);
  assert.match(s, /adminWriteLimiter\(\)/);
  assert.match(s, /cspReportLimiter\(\)/);
});
