const test = require('node:test');
const assert = require('node:assert/strict');

const { runSyncAllCategories } = require('../scripts/lib/mzakka-sync-runner');
const { toJsonlRecord } = require('../scripts/crawl-mzakka-new-items');

const LEAVES = [
  { id: 101, name: '第一類' },
  { id: 102, name: '最後類' },
];

function emptyPage(categoryId) {
  return { categoryId, totalPages: 1, listItemsSeen: 0, skippedFailed: 0, records: [] };
}

function completedState() {
  return {
    leafIndex: 1,
    lastPage: 0,
    totalUploaded: 12,
    totalNew: 12,
    done: [101, 102],
    lastRefreshAt: '2026-11-08T00:00:00.000Z',
  };
}

test('crawler records preserve the ended flag used by the import upsert', () => {
  const record = toJsonlRecord(
    { id: 'KNOWN-1', productUrl: 'https://mzakka.com/item', statusText: '販売終了' },
    { id: 'KNOWN-1', isEnded: true }
  );
  assert.equal(record.isEnded, true);
});

test('completed legacy crawl restarts at the first leaf instead of repeating the last', async () => {
  const visited = [];
  const state = completedState();
  const result = await runSyncAllCategories({
    leaves: LEAVES,
    state,
    seen: new Set(),
    refreshExisting: false,
    crawl: async ({ categoryId }) => {
      visited.push(categoryId);
      return emptyPage(categoryId);
    },
    upload: async () => assert.fail('empty pages must not upload'),
  });

  assert.deepEqual(visited, [101, 102]);
  assert.equal(state.leafIndex, 0);
  assert.equal(state.lastPage, 0);
  assert.deepEqual(state.done, []);
  assert.equal(result.categoriesCompleted, 2);
});

test('refresh revisits known items and submits ended records for deactivation', async () => {
  const crawlOptions = [];
  const uploaded = [];
  const state = completedState();
  const ended = { id: 'KNOWN-1', name: '已完售', priceYen: 500, isEnded: true };
  const result = await runSyncAllCategories({
    leaves: [LEAVES[0]],
    state,
    seen: new Set(['KNOWN-1']),
    refreshExisting: true,
    now: new Date('2026-11-08T01:00:00.000Z'),
    crawl: async (options) => {
      crawlOptions.push(options);
      return { ...emptyPage(options.categoryId), listItemsSeen: 1, records: [ended] };
    },
    upload: async (records) => {
      uploaded.push(records);
      return { productsUpserted: records.length };
    },
  });

  assert.equal(crawlOptions.length, 1);
  assert.equal(crawlOptions[0].includeEnded, true);
  assert.equal(crawlOptions[0].seenIds.size, 0);
  assert.deepEqual(uploaded, [[ended]]);
  assert.equal(result.refreshed, 1);
  assert.equal(result.productsUpserted, 1);
  assert.equal(state.lastRefreshAt, '2026-11-08T01:00:00.000Z');
});

test('refresh does not create previously unseen ended products', async () => {
  const uploaded = [];
  const result = await runSyncAllCategories({
    leaves: [LEAVES[0]],
    state: completedState(),
    seen: new Set(['LEGACY-UNIMPORTED']),
    knownIds: new Set(['KNOWN-1']),
    refreshExisting: true,
    crawl: async (options) => ({
      ...emptyPage(options.categoryId),
      listItemsSeen: 2,
      records: [
        { id: 'KNOWN-1', isEnded: true },
        { id: 'UNKNOWN-ENDED', isEnded: true },
      ],
    }),
    upload: async (records) => {
      uploaded.push(...records);
      return { productsUpserted: records.length };
    },
  });

  assert.deepEqual(uploaded.map((record) => record.id), ['KNOWN-1']);
  assert.equal(result.skippedUnknownEnded, 1);
});

test('discovery retains seen-id dedupe and the configured ended-item policy', async () => {
  const state = completedState();
  const seen = new Set(['KNOWN-1']);
  let crawlOptions;
  await runSyncAllCategories({
    leaves: [LEAVES[0]],
    state,
    seen,
    refreshExisting: false,
    includeEnded: false,
    crawl: async (options) => {
      crawlOptions = options;
      return emptyPage(options.categoryId);
    },
    upload: async () => assert.fail('empty pages must not upload'),
  });

  assert.equal(crawlOptions.includeEnded, false);
  assert.equal(crawlOptions.seenIds, seen);
  assert.equal(state.lastRefreshAt, '2026-11-08T00:00:00.000Z');
});

test('bounded dry-run stops at the requested page and item limits without saving state', async () => {
  const state = completedState();
  let persists = 0;
  const crawls = [];
  const result = await runSyncAllCategories({
    leaves: LEAVES,
    state,
    seen: new Set(),
    knownIds: new Set(['KNOWN-1']),
    refreshExisting: true,
    dryRun: true,
    maxLeaves: 1,
    maxPagesPerLeaf: 1,
    limit: 1,
    crawl: async (options) => {
      crawls.push(options);
      return {
        ...emptyPage(options.categoryId),
        totalPages: 3,
        listItemsSeen: 2,
        records: [{ id: 'KNOWN-1' }, { id: 'KNOWN-2' }],
      };
    },
    upload: async () => assert.fail('dry-run must not upload'),
    persist: () => { persists++; },
  });

  assert.equal(crawls.length, 1);
  assert.equal(crawls[0].limit, 1);
  assert.equal(result.status, 'dry-run');
  assert.equal(result.itemsListed, 2);
  assert.equal(persists, 0);
  assert.deepEqual(state, completedState());
});

test('a limited write run resumes the same leaf and never marks it complete', async () => {
  const state = completedState();
  const pages = [];
  const result = await runSyncAllCategories({
    leaves: LEAVES,
    state,
    seen: new Set(),
    knownIds: new Set(['KNOWN-1']),
    refreshExisting: true,
    maxLeaves: 1,
    maxPagesPerLeaf: 1,
    limit: 5,
    crawl: async (options) => {
      pages.push(options.startPage);
      return {
        ...emptyPage(options.categoryId),
        totalPages: 3,
        listItemsSeen: 200,
        records: Array.from({ length: 5 }, (_, index) => ({ id: `KNOWN-${index + 1}` })),
      };
    },
    upload: async (records) => ({ productsUpserted: records.length }),
  });

  assert.deepEqual(pages, [1]);
  assert.equal(result.status, 'paused');
  assert.equal(state.leafIndex, 0);
  assert.equal(state.lastPage, 1);
  assert.deepEqual(state.done, []);
  assert.equal(state.lastRefreshAt, '2026-11-08T00:00:00.000Z');
});

test('a failed refresh saves page progress so retry does not restart the category', async () => {
  const state = { ...completedState(), leafIndex: 0, done: [] };
  const snapshots = [];
  const crawl = async ({ startPage }) => {
    if (startPage === 2) throw new Error('temporary network failure');
    return { ...emptyPage(101), totalPages: 2, listItemsSeen: 1 };
  };

  await assert.rejects(runSyncAllCategories({
    leaves: [LEAVES[0]],
    state,
    seen: new Set(),
    refreshExisting: true,
    crawl,
    upload: async () => assert.fail('empty pages must not upload'),
    persist: (current) => snapshots.push({ ...current, done: [...current.done] }),
  }), /temporary network failure/);

  assert.equal(state.leafIndex, 0);
  assert.equal(state.lastPage, 1);
  assert.ok(snapshots.some((snapshot) => snapshot.lastPage === 1));

  const pages = [];
  await runSyncAllCategories({
    leaves: [LEAVES[0]],
    state,
    seen: new Set(),
    refreshExisting: true,
    now: new Date('2026-11-08T01:00:00.000Z'),
    crawl: async (options) => {
      pages.push(options.startPage);
      return { ...emptyPage(options.categoryId), totalPages: 2 };
    },
    upload: async () => assert.fail('empty pages must not upload'),
  });
  assert.deepEqual(pages, [2]);
});

test('production writes and refresh cadence are explicit and safe by default', () => {
  const { parseSyncConfig, shouldRefreshExisting } = require('../scripts/sync-all-categories');
  const config = parseSyncConfig({});
  assert.equal(config.writeEnabled, false);
  assert.equal(config.refreshExisting, null);
  assert.equal(config.maxLeaves, 1);
  assert.equal(config.maxPagesPerLeaf, 1);
  assert.equal(config.limit, 5);
  assert.equal(parseSyncConfig({ SYNC_WRITE_ENABLED: 'true' }).maxLeaves, 0);
  const legacyState = completedState();
  delete legacyState.lastRefreshAt;
  assert.equal(shouldRefreshExisting(legacyState, config, new Date('2026-11-08T01:00:00.000Z')), true);
  assert.equal(shouldRefreshExisting({ lastRefreshAt: '2026-11-08T00:30:00.000Z' }, config, new Date('2026-11-08T01:00:00.000Z')), false);
  assert.equal(shouldRefreshExisting(completedState(), { ...config, refreshExisting: false }, new Date('2026-11-08T01:00:00.000Z')), false);
});

test('an explicit production env file overrides the local database without exposing credentials', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { loadSyncEnvironment } = require('../scripts/sync-all-categories');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ohya-sync-env-'));
  const file = path.join(directory, 'production.env');
  fs.writeFileSync(file, 'DATABASE_URL=postgres://production.example/catalog\nCRON_SECRET=test-only-secret\n');
  const env = { DATABASE_URL: 'postgres://localhost/test', PATH: process.env.PATH };
  try {
    const loaded = loadSyncEnvironment({ ...env, SYNC_ENV_FILE: file });
    assert.equal(loaded.DATABASE_URL, 'postgres://production.example/catalog');
    assert.equal(loaded.CRON_SECRET, 'test-only-secret');
    assert.equal(env.DATABASE_URL, 'postgres://localhost/test');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('production env and single-process locking prevent unsafe background overlap', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const {
    acquireSyncLock,
    loadSyncEnvironment,
    parseSyncConfig,
    releaseSyncLock,
  } = require('../scripts/sync-all-categories');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ohya-sync-production-'));
  const file = path.join(directory, 'sync.lock');
  fs.mkdirSync(path.join(directory, '.vercel'));
  fs.writeFileSync(path.join(directory, '.vercel', '.env.production.local'), 'DATABASE_URL=postgres://production.example/catalog\n');
  try {
    const loaded = loadSyncEnvironment({ DATABASE_URL: 'postgres://localhost/test', NODE_ENV: 'production' }, directory);
    assert.equal(loaded.DATABASE_URL, 'postgres://production.example/catalog');
    assert.equal(parseSyncConfig(loaded).writeEnabled, false);
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid }));
    assert.throws(() => acquireSyncLock(file), /already running/);
    fs.writeFileSync(file, JSON.stringify({ pid: 99999999 }));
    const lock = acquireSyncLock(file);
    assert.equal(lock.pid, process.pid);
    assert.throws(() => acquireSyncLock(file), /already running/);
    releaseSyncLock(file, lock);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('known product IDs are loaded with a minimal read-only source_key query', async () => {
  const { loadKnownMzakkaIds } = require('../scripts/sync-all-categories');
  const queries = [];
  const pool = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ source_key: 'KNOWN-1' }, { source_key: 'KNOWN-2' }, { source_key: null }] };
    },
  };
  const ids = await loadKnownMzakkaIds(pool);
  assert.deepEqual([...ids].sort(), ['KNOWN-1', 'KNOWN-2']);
  assert.match(queries[0], /SELECT\s+source_key\s+FROM\s+products/i);
  assert.match(queries[0], /source\s*=\s*'mzakka'/i);
  assert.doesNotMatch(queries[0], /SELECT\s+\*/i);
});

test('run summary exposes failed details and actual upserts for health reporting', async () => {
  const state = completedState();
  const result = await runSyncAllCategories({
    leaves: [LEAVES[0]],
    state,
    seen: new Set(['KNOWN-1']),
    refreshExisting: true,
    now: new Date('2026-11-08T01:00:00.000Z'),
    crawl: async (options) => ({
      ...emptyPage(options.categoryId),
      listItemsSeen: 3,
      skippedFailed: 1,
      records: [{ id: 'KNOWN-1' }, { id: 'KNOWN-2' }],
    }),
    upload: async () => ({ productsUpserted: 2 }),
  });

  assert.equal(result.itemsListed, 3);
  assert.equal(result.skippedFailed, 1);
  assert.equal(result.submitted, 2);
  assert.equal(result.productsUpserted, 2);
  assert.equal(result.mode, 'refresh');
  assert.equal(result.status, 'completed');
});
