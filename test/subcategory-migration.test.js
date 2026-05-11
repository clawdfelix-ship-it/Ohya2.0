const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('subcategory migration exists and contains backfill logic', () => {
  const p = path.join(__dirname, '..', 'migrations', '2026-05-03-subcategory-backfill.sql');
  assert.ok(fs.existsSync(p), 'migration file must exist');
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /ALTER\s+TABLE\s+categories\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+parent_id/i);
  assert.match(s, /-other/i);
  assert.match(s, /UPDATE\s+products/i);
});

