const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('shipany generate-label requires orders:write and uses shipping status', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.match(s, /\/api\/admin\/shipany\/generate-label/);
  assert.match(s, /requirePermission\('orders:write'\)/);
  assert.doesNotMatch(s, /'shipped'/);
  assert.match(s, /'shipping'/);
});

test('admin orders tracking endpoint exists and requires orders:read', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.match(s, /\/api\/admin\/orders\/:id\/tracking/);
  assert.match(s, /requirePermission\('orders:read'\)/);
});

