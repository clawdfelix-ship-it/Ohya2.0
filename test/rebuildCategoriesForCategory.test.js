const test = require('node:test');
const assert = require('node:assert/strict');

test('rebuild categories for category: parses args', () => {
  const { parseArgs } = require('../scripts/rebuild-categories-for-category');
  const a = parseArgs(['node', 'x', '--category-name', '新商品・新規取扱商品', '--limit', '10', '--concurrency', '3', '--delay-ms', '150', '--dry-run', '--progress-every', '500']);
  assert.deepEqual(a, {
    categoryName: '新商品・新規取扱商品',
    limit: 10,
    concurrency: 3,
    delayMs: 150,
    dryRun: true,
    progressEvery: 500,
  });
});

test('rebuild categories for category: builds safe select SQL with bound params', () => {
  const { buildSelectTargetsSql } = require('../scripts/rebuild-categories-for-category');
  const { sql, params } = buildSelectTargetsSql({ categoryId: 123, limit: 7 });
  assert.match(sql, /WHERE\s+p\.category_id\s*=\s*\$1/i);
  assert.match(sql, /LIMIT\s+\$2/i);
  assert.deepEqual(params, [123, 7]);
});
