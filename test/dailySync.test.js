const test = require('node:test');
const assert = require('node:assert/strict');
const events = require('node:events');
const https = require('node:https');

function loadDailySyncWithStubs() {
  const dailySyncPath = require.resolve('../utils/dailySync');
  const resolverPath = require.resolve('../utils/mzakkaCategoryResolver');
  const importPath = require.resolve('../utils/mzakkaImport');
  const newItemsPath = require.resolve('../utils/mzakkaNewItems');
  const fetchDescPath = require.resolve('../scripts/fetch-mzakka-description');
  const taxonomyPath = require.resolve('../scripts/lib/mzakka-taxonomy');

  const originals = {
    dailySync: require.cache[dailySyncPath],
    resolver: require.cache[resolverPath],
    importUtils: require.cache[importPath],
    newItems: require.cache[newItemsPath],
    fetchDesc: require.cache[fetchDescPath],
    taxonomy: require.cache[taxonomyPath],
  };

  require.cache[resolverPath] = {
    exports: {
      resolveItemNode: () => ({ nodeId: null, via: null }),
      loadDbNodeMap: async () => new Map(),
    },
  };
  require.cache[importPath] = {
    exports: {
      toProductUpsertInput: (item, categoryId) => ({
        name: item.name,
        name_zh_hk: item.name,
        slug: `mzakka-${String(item.id).toLowerCase()}`,
        description: item.description || item.name,
        description_zh_hk: item.description || item.name,
        short_description_zh_hk: item.name,
        price: 100,
        original_price: null,
        category_id: categoryId,
        image_url: 'https://i.mzakka.com/item/M1/main.jpg',
        gallery_images: ['https://i.mzakka.com/item/M1/main.jpg'],
        source: 'mzakka',
        source_key: item.id,
        source_url: item.productUrl,
        sync_status: 'synced',
        raw_payload: { isEnded: false },
      }),
      toSkuUpsertInput: (_item, productId) => ({
        product_id: productId,
        sku: 'M1',
        attributes: {},
        stock: 0,
        is_active: true,
      }),
      toProductMediaRows: (_item, productId) => ([{
        product_id: productId,
        media_url: 'https://i.mzakka.com/item/M1/main.jpg',
        media_type: 'image',
        alt_text: 'main',
        sort_order: 0,
        source_key: 'm1-0',
      }]),
      toProductSectionRows: () => ([]),
    },
  };
  require.cache[newItemsPath] = {
    exports: {
      parseMzakkaDetailPage: (_html, options = {}) => ({
        id: 'M1',
        name: '測試商品',
        description: '描述',
        category: '未分類',
        images: ['https://i.mzakka.com/item/M1/main.jpg'],
        productUrl: options.productUrl || 'https://mzakka.com/pc/detail/item.php?item_id=M1',
        isEnded: false,
      }),
    },
  };
  require.cache[fetchDescPath] = {
    exports: {
      extractDescriptionFromDetailHtml: () => '描述',
    },
  };
  require.cache[taxonomyPath] = {
    exports: {
      extractItemLinks: () => [],
      extractPaging: () => ({ pages: 1 }),
    },
  };
  delete require.cache[dailySyncPath];

  return {
    dailySync: require('../utils/dailySync'),
    restore() {
      if (originals.dailySync) require.cache[dailySyncPath] = originals.dailySync;
      else delete require.cache[dailySyncPath];
      if (originals.resolver) require.cache[resolverPath] = originals.resolver;
      else delete require.cache[resolverPath];
      if (originals.importUtils) require.cache[importPath] = originals.importUtils;
      else delete require.cache[importPath];
      if (originals.newItems) require.cache[newItemsPath] = originals.newItems;
      else delete require.cache[newItemsPath];
      if (originals.fetchDesc) require.cache[fetchDescPath] = originals.fetchDesc;
      else delete require.cache[fetchDescPath];
      if (originals.taxonomy) require.cache[taxonomyPath] = originals.taxonomy;
      else delete require.cache[taxonomyPath];
    },
  };
}

function stubHttpsGet(body = '<html></html>') {
  const originalGet = https.get;
  https.get = (url, options, callback) => {
    const response = new events.EventEmitter();
    response.statusCode = 200;
    process.nextTick(() => {
      callback(response);
      response.emit('data', body);
      response.emit('end');
    });
    return {
      on() {
        return this;
      },
      destroy() {},
    };
  };
  return () => {
    https.get = originalGet;
  };
}

test('processPendingAndRebuild keeps import and dequeue in one transaction', async () => {
  const { dailySync, restore } = loadDailySyncWithStubs();
  const restoreHttps = stubHttpsGet();
  const importLog = [];
  const rebuildLog = [];
  let connectCount = 0;

  const pool = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('SELECT item_id, rank, attempts')) {
        return { rows: [{ item_id: 'M1', rank: 1, attempts: 0 }] };
      }
      if (text.includes('SELECT (SELECT count(*) FROM new_arrival_rank)')) {
        return { rows: [{ ranks: 1, live_pending: 0 }] };
      }
      throw new Error(`unexpected pool query: ${text}`);
    },
    async connect() {
      connectCount++;
      if (connectCount === 1) {
        return {
          async query(sql, params) {
            const text = String(sql);
            importLog.push({ sql: text, params });
            if (text.includes('RETURNING id')) return { rows: [{ id: 42 }] };
            if (text.includes('SELECT id FROM products')) return { rows: [{ id: 42 }] };
            return { rows: [] };
          },
          release() {},
        };
      }
      return {
        async query(sql, params) {
          rebuildLog.push({ sql: String(sql), params });
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  try {
    const result = await dailySync.processPendingAndRebuild(pool);
    assert.equal(result.imported, 1);
    assert.equal(result.failed, 0);
  } finally {
    restoreHttps();
    restore();
  }

  const importSql = importLog.map((entry) => entry.sql);
  const beginIndex = importSql.findIndex((sql) => sql === 'BEGIN');
  const deleteIndex = importSql.findIndex((sql) => sql.includes('DELETE FROM sync_pending_items'));
  const commitIndex = importSql.findIndex((sql) => sql === 'COMMIT');

  assert.ok(beginIndex >= 0);
  assert.ok(deleteIndex > beginIndex);
  assert.ok(commitIndex > deleteIndex);
  assert.equal(importSql.some((sql) => sql === 'ROLLBACK'), false);
  assert.ok(rebuildLog.some((entry) => entry.sql === 'BEGIN'));
});

test('processPendingAndRebuild rolls back partial item imports on failure', async () => {
  const { dailySync, restore } = loadDailySyncWithStubs();
  const restoreHttps = stubHttpsGet();
  const importLog = [];
  const poolLog = [];
  let connectCount = 0;

  const pool = {
    async query(sql, params) {
      const text = String(sql);
      poolLog.push({ sql: text, params });
      if (text.includes('SELECT item_id, rank, attempts')) {
        return { rows: [{ item_id: 'M1', rank: 1, attempts: 0 }] };
      }
      if (text.includes('UPDATE sync_pending_items')) {
        return { rows: [] };
      }
      if (text.includes('SELECT (SELECT count(*) FROM new_arrival_rank)')) {
        return { rows: [{ ranks: 0, live_pending: 1 }] };
      }
      return { rows: [] };
    },
    async connect() {
      connectCount++;
      if (connectCount === 1) {
        return {
          async query(sql, params) {
            const text = String(sql);
            importLog.push({ sql: text, params });
            if (text.includes('RETURNING id')) return { rows: [{ id: 42 }] };
            if (text.includes('SELECT id FROM products')) return { rows: [{ id: 42 }] };
            if (text.includes('INSERT INTO mzakka_product_media')) {
              throw new Error('media insert failed');
            }
            return { rows: [] };
          },
          release() {},
        };
      }
      return {
        async query() {
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  try {
    const result = await dailySync.processPendingAndRebuild(pool);
    assert.equal(result.imported, 0);
    assert.equal(result.failed, 1);
  } finally {
    restoreHttps();
    restore();
  }

  const importSql = importLog.map((entry) => entry.sql);
  assert.ok(importSql.includes('BEGIN'));
  assert.ok(importSql.includes('ROLLBACK'));
  assert.equal(importSql.some((sql) => sql.includes('DELETE FROM sync_pending_items')), false);
  assert.ok(poolLog.some((entry) => entry.sql.includes('UPDATE sync_pending_items')));
});
