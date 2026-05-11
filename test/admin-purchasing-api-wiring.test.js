const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('purchasing endpoints exist and use inventory permissions', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.match(s, /\/api\/admin\/suppliers/);
  assert.match(s, /requirePermission\('inventory:read'\)/);
  assert.match(s, /requirePermission\('inventory:write'\)/);
  assert.match(s, /\/api\/admin\/purchase-orders\/:id\/receive/);
  assert.match(s, /UPDATE purchase_orders SET status = 'received'/);
});
