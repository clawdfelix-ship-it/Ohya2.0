const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('inventory levels endpoint exists and requires inventory:read', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /\/api\/admin\/inventory\/levels/);
  assert.match(s, /requirePermission\('inventory:read'\)/);
  assert.match(s, /inventory_levels/);
});

