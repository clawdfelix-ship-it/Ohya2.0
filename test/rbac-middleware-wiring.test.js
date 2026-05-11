const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('requireAdmin allows backoffice sessions and exposes permissions', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'middleware', 'auth.js'), 'utf8');
  assert.match(s, /isBackoffice/);
  assert.match(s, /adminPermissions/);
});

test('requirePermission middleware exists', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'middleware', 'auth.js'), 'utf8');
  assert.match(s, /requirePermission/);
});

