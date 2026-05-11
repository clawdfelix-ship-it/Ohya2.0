const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration adds inventory_warehouses.is_default', () => {
  const p = path.join(__dirname, '..', 'migrations', '2026-05-04-inventory-warehouse-default.sql');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /ALTER TABLE\s+inventory_warehouses\s+ADD COLUMN IF NOT EXISTS\s+is_default/i);
  assert.match(s, /CREATE UNIQUE INDEX IF NOT EXISTS/i);
  assert.match(s, /is_default/i);
});

