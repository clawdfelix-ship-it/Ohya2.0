const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createMzakkaSyncService,
  normalizeSyncOptions,
} = require('../utils/mzakkaSync');
const { CORE_BOOTSTRAP_STEPS } = require('../utils/dbBootstrap');

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

test('mzakka sync routes register admin, internal sync, and bootstrap endpoints', () => {
  const routes = [];
  const app = {
    get(pathname) {
      routes.push(`GET ${pathname}`);
    },
    post(pathname) {
      routes.push(`POST ${pathname}`);
    },
  };

  require('../routes/mzakka-sync')(app, null);

  assert.ok(routes.includes('POST /api/admin/catalog/mzakka-sync'));
  assert.ok(routes.includes('GET /api/internal/jobs/mzakka-sync'));
  assert.ok(routes.includes('POST /api/internal/jobs/mzakka-sync'));
  assert.ok(routes.includes('GET /api/internal/jobs/db-bootstrap'));
  assert.ok(routes.includes('POST /api/internal/jobs/db-bootstrap'));
});

test('db bootstrap includes catalog core steps needed for mzakka sync', () => {
  const names = CORE_BOOTSTRAP_STEPS.map((step) => step.name);
  assert.ok(names.includes('categories'));
  assert.ok(names.includes('products'));
  assert.ok(names.includes('product skus'));
});

test('internal GET sync route accepts CRON_SECRET and forwards query options', async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  delete process.env.MZAKKA_SYNC_SECRET;
  process.env.CRON_SECRET = 'cron-secret';

  let internalHandler = null;
  const app = {
    get(pathname, handler) {
      if (pathname === '/api/internal/jobs/mzakka-sync') internalHandler = handler;
    },
    post() {},
  };

  const syncModulePath = require.resolve('../utils/mzakkaSync');
  const originalSyncModule = require.cache[syncModulePath];
  require.cache[syncModulePath] = {
    exports: {
      normalizeSyncOptions: (input = {}) => ({
        pages: Number(input.pages || 1),
        limit: Number(input.limit || 24),
      }),
      syncMzakkaNewItemsToDb: async (options) => ({
        recordsFetched: 0,
        import: { productsUpserted: 0, skusUpserted: 0 },
        pages: options.pages,
        limit: options.limit,
      }),
    },
  };

  delete require.cache[require.resolve('../routes/mzakka-sync')];
  require('../routes/mzakka-sync')(app, { fake: true });

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  try {
    await internalHandler({
      query: { pages: '3', limit: '9' },
      body: {},
      get(name) {
        if (String(name).toLowerCase() === 'authorization') return 'Bearer cron-secret';
        return '';
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.source, 'internal');
    assert.equal(res.body.result.pages, 3);
    assert.equal(res.body.result.limit, 9);
  } finally {
    if (originalSyncModule) require.cache[syncModulePath] = originalSyncModule;
    else delete require.cache[syncModulePath];
    delete require.cache[require.resolve('../routes/mzakka-sync')];
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
});
