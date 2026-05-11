const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('rbac seed migration exists and inserts default roles', () => {
  const p = path.join(__dirname, '..', 'migrations', '2026-05-04-rbac-seed.sql');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /INSERT INTO\s+admin_roles/i);
  assert.match(s, /WHERE NOT EXISTS/i);
  assert.match(s, /inventory:read/i);
});

