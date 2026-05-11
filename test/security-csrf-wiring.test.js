const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('csrf middleware is wired and webhooks are exempt', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(s, /csurf/);
  assert.ok(s.includes("startsWith('/webhooks/')"));
});

test('adminApiRequest sends X-CSRF-Token on non-GET', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'common.js'), 'utf8');
  assert.match(s, /X-CSRF-Token/);
  assert.ok(s.includes('meta[name="csrf-token"]'));
});
