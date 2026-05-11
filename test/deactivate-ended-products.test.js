const test = require('node:test');
const assert = require('node:assert/strict');

test('deactivate ended products script: parses args', () => {
  const { parseArgs } = require('../scripts/deactivate-ended-products');
  const args = parseArgs(['node', 'script', '--dry-run', '--limit', '10', '--pattern', '販売終了']);
  assert.deepEqual(args, { dryRun: true, limit: 10, pattern: '販売終了' });
});

test('deactivate ended products script: builds safe SQL with bound params', () => {
  const { buildDeactivateSql } = require('../scripts/deactivate-ended-products');
  const { sql, params } = buildDeactivateSql({ pattern: "販売終了'; DROP TABLE products; --", limit: 5 });
  assert.match(sql, /ILIKE/);
  assert.match(sql, /UPDATE\s+products/i);
  assert.match(sql, /LIMIT\s+\$2/i);
  assert.equal(params.length, 2);
  assert.equal(params[1], 5);
});

