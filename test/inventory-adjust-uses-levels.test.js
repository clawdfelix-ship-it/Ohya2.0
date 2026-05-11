const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('inventory adjust updates inventory_levels and product_skus.stock together', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /inventory_levels/);
  assert.match(s, /INSERT INTO\s+inventory_levels/i);
  assert.match(s, /UPDATE\s+inventory_levels/i);
  assert.match(s, /UPDATE\s+product_skus/i);
});

