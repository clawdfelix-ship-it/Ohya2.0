const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin orders API uses requirePermission (rbac-aligned)', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'orders.js'), 'utf8');
  assert.match(s, /\/api\/admin\/orders'\s*,\s*requirePermission\('orders:read'\)/);
  assert.match(s, /\/api\/admin\/orders\/:id'\s*,\s*requirePermission\('orders:read'\)/);
  assert.match(s, /\/api\/admin\/orders\/:id\/status'\s*,\s*requirePermission\('orders:write'\)/);
  assert.doesNotMatch(s, /\/api\/admin\/orders'[\s\S]*requireAdmin/);
});

