const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isLiveIdMismatch,
  runDescriptionBackfill,
  selectDescriptionCandidates,
} = require('../scripts/lib/mzakka-description-backfill');

const product = (id, overrides = {}) => ({
  id: 1,
  source_key: id,
  source_url: `https://mzakka.com/pc/detail/item.php?item_id=${id}`,
  description_zh_hk: 'short',
  raw_payload: {},
  ...overrides,
});

test('backfill treats the DB version marker as authoritative over stale checkpoints', () => {
  const products = [product('A'), product('B'), product('C', { source_url: null })];
  assert.deepEqual(selectDescriptionCandidates(products, new Set(['A'])).map((p) => p.source_key), ['A', 'B']);
  assert.deepEqual(selectDescriptionCandidates([
    product('A', { raw_payload: { descriptionVersion: 'mzakka-description-v2' } }),
  ]), []);
});

test('backfill never imports a detail record under a different product ID', async () => {
  const uploaded = [];
  const summary = await runDescriptionBackfill({
    products: [product('L4417')],
    fetchDetail: async () => ({ id: 'L4416' }),
    upload: async (records) => { uploaded.push(...records); return { productsUpserted: 1 }; },
    logger: { log() {} },
  });
  assert.equal(summary.idMismatch, 1);
  assert.equal(summary.imported, 0);
  assert.deepEqual(uploaded, []);
});

test('backfill records successful imports atomically and reports failed IDs', async () => {
  const completedIds = new Set();
  const checkpoints = [];
  const summary = await runDescriptionBackfill({
    products: [product('A'), product('B'), product('C')],
    fetchDetail: async (p) => {
      if (p.source_key === 'B') throw new Error('temporary fetch error');
      return { id: p.source_key, description: 'complete', sections: [{ sourceAnchor: 'item_info' }] };
    },
    upload: async (records) => ({ productsUpserted: records.length }),
    persist: async (s, ids) => { checkpoints.push({ imported: s.imported, completed: [...ids] }); },
    completedIds,
    concurrency: 1,
    delayMs: 0,
    logger: { log() {} },
  });
  assert.equal(summary.imported, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.status, 'completed-with-failures');
  assert.deepEqual([...completedIds].sort(), ['A', 'C']);
  assert.ok(checkpoints.some((checkpoint) => checkpoint.imported === 2));
});

test('backfill enforces a hard maximum of 100 items per run', async () => {
  let fetched = 0;
  const summary = await runDescriptionBackfill({
    products: Array.from({ length: 105 }, (_, index) => product(`ID-${index}`)),
    limit: 1000,
    concurrency: 1,
    delayMs: 0,
    fetchDetail: async (p) => { fetched++; return { id: p.source_key, sections: [] }; },
    upload: async () => ({ productsUpserted: 1 }),
    logger: { log() {} },
  });
  assert.equal(summary.selected, 100);
  assert.equal(summary.imported, 100);
  assert.equal(fetched, 100);
});

test('persistent failures are quarantined after bounded attempts instead of looping forever', () => {
  const { recordFailureAttempts } = require('../scripts/lib/mzakka-description-backfill');
  const attempts = {};
  const skippedIds = new Set();
  const counted = new Set();
  for (let run = 0; run < 3; run++) {
    recordFailureAttempts([{ id: 'BROKEN', error: 'timeout' }], attempts, skippedIds, counted);
    counted.clear();
  }
  assert.equal(attempts.BROKEN, 3);
  assert.ok(skippedIds.has('BROKEN'));
});

test('CLI limit inherits shell settings and is capped at 100', () => {
  const { parseArgs } = require('../scripts/backfill-mzakka-descriptions-v2');
  assert.deepEqual(parseArgs([], {}), { limit: 100 });
  assert.deepEqual(parseArgs([], { DESCRIPTION_BACKFILL_LIMIT: '5' }), { limit: 5 });
  assert.deepEqual(parseArgs(['--limit', '100'], {}), { limit: 100 });
  assert.deepEqual(parseArgs(['--limit', '999'], {}), { limit: 100 });
});
