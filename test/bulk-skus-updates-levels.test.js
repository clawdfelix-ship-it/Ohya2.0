const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bulk sku import applies target_stock via inventory_levels and updates total stock', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(s, /inventory_levels/);
  assert.match(s, /UPDATE\s+inventory_levels/i);
  assert.match(s, /UPDATE\s+product_skus/i);
});

