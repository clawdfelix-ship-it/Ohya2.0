const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration adds inventory_levels and backfills from product_skus.stock', () => {
  const p = path.join(__dirname, '..', 'migrations', '2026-05-04-inventory-levels.sql');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /CREATE TABLE IF NOT EXISTS\s+inventory_levels/i);
  assert.match(s, /inventory_warehouses/i);
  assert.match(s, /product_skus/i);
  assert.match(s, /INSERT INTO\s+inventory_levels/i);
  assert.match(s, /ps\.stock/i);
});
