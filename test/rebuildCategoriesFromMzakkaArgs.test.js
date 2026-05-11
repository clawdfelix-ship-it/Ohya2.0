const test = require('node:test');
const assert = require('node:assert/strict');

test('rebuild categories script: parses args', () => {
  const { parseArgs } = require('../scripts/rebuild-categories-from-mzakka');
  const a = parseArgs(['node', 'x', '--limit', '10', '--concurrency', '3', '--delay-ms', '150', '--rebuild-all', '--progress-every', '500']);
  assert.deepEqual(a, { limit: 10, concurrency: 3, delayMs: 150, rebuildAll: true, dryRun: false, sku: null, progressEvery: 500 });
});

test('rebuild categories script: supports dry-run without DATABASE_URL', async () => {
  const { dryRunSample } = require('../scripts/rebuild-categories-from-mzakka');
  const out = await dryRunSample(
    { sku: '00T096' },
    {
      fetchHtml: async () =>
        '<div id="breadcrumb"><a href="category.php?category=123">男士護理</a></div>',
    }
  );
  assert.ok(out.rootCategoryName);
});
