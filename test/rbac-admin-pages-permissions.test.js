const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin pages are guarded by permission keys', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminPages.js'), 'utf8');
  assert.match(s, /requireAdminPage\('inventory:read'\)/);
  assert.match(s, /requireAdminPage\('inventory:write'\)/);
  assert.match(s, /requireAdminPage\('inventory:bulk'\)/);
  assert.match(s, /requireAdminPage\('catalog:read'\)/);
  assert.match(s, /requireAdminPage\('orders:read'\)/);
  assert.match(s, /requireAdminPage\('refunds:read'\)/);
});

