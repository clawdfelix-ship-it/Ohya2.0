const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createMzakkaSyncService,
  normalizeSyncOptions,
} = require('../utils/mzakkaSync');

test('normalizeSyncOptions keeps sync defaults bounded', () => {
  const out = normalizeSyncOptions({});
  assert.equal(out.categoryId, 1894);
  assert.equal(out.startPage, 1);
  assert.equal(out.pages, 1);
  assert.equal(out.limit, 24);
  assert.equal(out.delayMs, 150);
  assert.equal(out.includeEnded, false);
  assert.equal(out.batchSize, 100);
});

test('mzakka sync service crawls records and imports them into DB layer', async () => {
  const calls = {
    crawl: null,
    import: null,
  };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzakka-sync-'));
  const debugJsonlPath = path.join(tmpDir, 'debug.jsonl');

  const service = createMzakkaSyncService({
    crawlMzakkaNewItems: async (options) => {
      calls.crawl = options;
      return {
        pagesFetched: 1,
        pageNumbers: [1],
        totalPages: 5,
        listItemsSeen: 3,
        records: [
          { id: 'M10001', name: '商品 A', category: '分類 A', priceYen: 1000, images: ['https://i.mzakka.com/a.jpg'] },
          { id: 'M10002', name: '商品 B', category: '分類 B', priceYen: 2000, images: ['https://i.mzakka.com/b.jpg'] },
        ],
      };
    },
    importMzakkaRecords: async (options) => {
      calls.import = options;
      return {
        mode: 'import',
        linesRead: options.records.length,
        categoriesUpserted: 2,
        productsUpserted: 2,
        skusUpserted: 2,
      };
    },
  });

  const fakePool = { connect: async () => ({ release() {} }) };
  const out = await service.syncMzakkaNewItemsToDb({
    pool: fakePool,
    pages: 2,
    limit: 10,
    batchSize: 50,
    debugJsonlPath,
  });

  assert.equal(calls.crawl.pages, 2);
  assert.equal(calls.crawl.limit, 10);
  assert.equal(calls.import.pool, fakePool);
  assert.equal(calls.import.batchSize, 50);
  assert.equal(calls.import.records.length, 2);
  assert.equal(out.recordsFetched, 2);
  assert.equal(out.import.productsUpserted, 2);
  assert.equal(out.debugJsonlPath, path.resolve(debugJsonlPath));
  assert.match(fs.readFileSync(debugJsonlPath, 'utf8'), /"id":"M10001"/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('mzakka sync routes register admin and internal POST endpoints', () => {
  const routes = [];
  const app = {
    post(pathname) {
      routes.push(pathname);
    },
  };

  require('../routes/mzakka-sync')(app, null);

  assert.ok(routes.includes('/api/admin/catalog/mzakka-sync'));
  assert.ok(routes.includes('/api/internal/jobs/mzakka-sync'));
});
