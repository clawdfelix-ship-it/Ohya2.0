const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('sku cost/inventory migration exists', () => {
  const p = path.join(__dirname, '..', 'migrations', '2026-05-04-default-warehouse-and-sku-cost-history.sql');
  assert.ok(fs.existsSync(p), 'migration file must exist');
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+sku_cost_history/i);
  assert.match(s, /INSERT\s+INTO\s+inventory_warehouses/i);
});
