const test = require('node:test');
const assert = require('node:assert/strict');

const { importItem } = require('../utils/dailySync');

function sampleItem() {
  return {
    id: 'T123',
    name: 'Test Item',
    description: 'desc',
    images: ['https://example.com/a.jpg'],
    priceYen: 1000,
    originalPriceYen: 1200,
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=T123',
    category: '未分類',
    productInfo: [],
    sections: [],
  };
}

test('dailySync importItem wraps the full upsert in a transaction (commit on success)', async () => {
  const calls = [];
  const dbClient = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('INSERT INTO products')) return { rows: [{ id: 123 }] };
      return { rows: [] };
    },
  };

  await importItem(dbClient, sampleItem(), 1, new Map());

  assert.equal(calls[0].sql.trim(), 'BEGIN');
  assert.equal(calls[calls.length - 1].sql.trim(), 'COMMIT');
  assert.ok(!calls.some((c) => c.sql.trim() === 'ROLLBACK'));
});

test('dailySync importItem rolls back if any step fails after product insert', async () => {
  const calls = [];
  const dbClient = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('INSERT INTO products')) return { rows: [{ id: 123 }] };
      if (String(sql).includes('INSERT INTO product_skus')) throw new Error('db write failed');
      return { rows: [] };
    },
  };

  await assert.rejects(() => importItem(dbClient, sampleItem(), 1, new Map()), /db write failed/);
  assert.equal(calls[0].sql.trim(), 'BEGIN');
  assert.ok(calls.some((c) => c.sql.trim() === 'ROLLBACK'));
  assert.ok(!calls.some((c) => c.sql.trim() === 'COMMIT'));
});

