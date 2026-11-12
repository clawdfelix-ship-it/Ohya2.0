const test = require('node:test');
const assert = require('node:assert/strict');

test('deactivate ended products script: parses args', () => {
  const { parseArgs } = require('../scripts/deactivate-ended-products');
  const args = parseArgs(['node', 'script', '--dry-run', '--limit', '10']);
  assert.deepEqual(args, { dryRun: true, limit: 10 });
});

test('deactivate ended products script: uses the synced ended flag with a bound limit', () => {
  const { buildDeactivateSql } = require('../scripts/deactivate-ended-products');
  const { sql, params } = buildDeactivateSql({ limit: 5 });
  assert.match(sql, /raw_payload->>'isEnded' = 'true'/);
  assert.match(sql, /UPDATE\s+products/i);
  assert.match(sql, /LIMIT\s+\$1/i);
  assert.doesNotMatch(sql, /ILIKE/);
  assert.deepEqual(params, [5]);
});

test('deactivate ended products script: keeps products with positive local stock on sale', () => {
  const { buildDeactivateSql } = require('../scripts/deactivate-ended-products');
  const { sql } = buildDeactivateSql({ limit: 5 });
  assert.match(sql, /NOT EXISTS/i);
  assert.match(sql, /product_skus/i);
  assert.match(sql, /stock\s*>\s*0/i);
  assert.match(sql, /is_active\s*=\s*true/i);
});

