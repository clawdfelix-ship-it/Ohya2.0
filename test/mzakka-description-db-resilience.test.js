const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { importMzakkaRecords } = require('../scripts/import-mzakka-to-postgres');
const {
  attachPoolErrorHandler,
  withDbRetry,
} = require('../scripts/lib/mzakka-db-resilience');

function fixture() {
  return {
    id: 'TEST001',
    name: 'Test product',
    priceYen: 100,
    description: 'A sufficiently detailed test description.',
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=TEST001',
    images: [],
    productInfo: [],
    sections: [],
  };
}

function client({ failProductInsert = false, persistedDescriptionVersion = '' } = {}) {
  const calls = [];
  const releases = [];
  return {
    calls,
    releases,
    async query(text) {
      calls.push(text);
      if (/^SELECT slug FROM products/.test(text)) {
        return {
          rows: persistedDescriptionVersion === 'mzakka-description-v2'
            ? [{ slug: 'mzakka-test001' }]
            : [],
        };
      }
      if (/^BEGIN$/.test(text) || /^COMMIT$/.test(text)) return { rows: [] };
      if (/^ROLLBACK$/.test(text)) {
        if (failProductInsert) {
          const error = new Error('socket closed during rollback');
          error.code = 'EADDRNOTAVAIL';
          throw error;
        }
        return { rows: [] };
      }
      if (/^INSERT INTO products/.test(text)) {
        if (failProductInsert) {
          const error = new Error('idle socket failed');
          error.code = 'EADDRNOTAVAIL';
          throw error;
        }
        return { rows: [{ id: 42, description_version: persistedDescriptionVersion }] };
      }
      return { rows: [] };
    },
    release(error) { releases.push(error); },
  };
}

test('an idle pool disconnect is handled without crashing the worker', () => {
  const pool = new EventEmitter();
  const warnings = [];
  attachPoolErrorHandler(pool, { warn: (message) => warnings.push(message) });
  const error = new Error('connection dropped');
  error.code = 'EADDRNOTAVAIL';
  assert.doesNotThrow(() => pool.emit('error', error));
  assert.equal(warnings.length, 1);
});

test('a broken transaction discards its client, preserves the error, and retries with a fresh client', async () => {
  const broken = client({ failProductInsert: true });
  const healthy = client();
  const pool = {
    async query() { return { rows: [] }; }, // category map on each idempotent retry
    connectCalls: 0,
    async connect() {
      this.connectCalls++;
      return this.connectCalls === 1 ? broken : healthy;
    },
  };
  const result = await withDbRetry(
    () => importMzakkaRecords({ records: [fixture()], pool, batchSize: 1 }),
    { retries: 2, baseDelayMs: 1, logger: { warn() {} } },
  );
  assert.equal(result.productsUpserted, 1);
  assert.equal(pool.connectCalls, 2);
  assert.equal(broken.releases.length, 1, 'the broken connection must always be released');
  assert.equal(broken.releases[0].code, 'EADDRNOTAVAIL', 'pg must discard a broken socket');
  assert.ok(broken.calls.some((sql) => /^ROLLBACK$/.test(sql)));
  assert.ok(healthy.calls.some((sql) => /^COMMIT$/.test(sql)));
  assert.equal(healthy.releases.length, 1);
  assert.equal(healthy.releases[0], undefined);
});

test('a normal refresh cannot erase an existing backfilled description marker', async () => {
  const c = client();
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { return c; },
  };
  await importMzakkaRecords({ records: [fixture()], pool, batchSize: 1 });
  const sql = c.calls.find((text) => /^INSERT INTO products/.test(text));
  assert.match(sql, /raw_payload = CASE/);
  assert.match(sql, /mzakka-description-v2/);
  assert.match(sql, /descriptionLayout/);
  assert.match(sql, /jsonb_set/);
  assert.match(sql, /description = CASE/);
  assert.match(sql, /description_zh_hk = CASE/);
});

test('a normal refresh preserves sections for an existing v2 backfill', async () => {
  const c = client({ persistedDescriptionVersion: 'mzakka-description-v2' });
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { return c; },
  };
  await importMzakkaRecords({ records: [fixture()], pool, batchSize: 1 });
  assert.equal(c.calls.some((text) => /DELETE FROM mzakka_product_sections/.test(text)), false);
});

test('an explicit v2 backfill still replaces stale sections', async () => {
  const c = client({ persistedDescriptionVersion: 'mzakka-description-v2' });
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { return c; },
  };
  await importMzakkaRecords({
    records: [{ ...fixture(), descriptionVersion: 'mzakka-description-v2' }],
    pool,
    batchSize: 1,
  });
  assert.equal(c.calls.some((text) => /DELETE FROM mzakka_product_sections/.test(text)), true);
});
