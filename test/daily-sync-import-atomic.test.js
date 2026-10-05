const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../utils/dailySync');

function makeSampleItem(overrides = {}) {
  return {
    id: 'T0001',
    name: 'Test Product',
    description: 'desc',
    images: [],
    priceYen: 1000,
    originalPriceYen: 1200,
    productUrl: 'https://example.invalid/item',
    category: '不明',
    isEnded: false,
    productInfo: [],
    sections: [],
    ...overrides,
  };
}

test('dailySync.importItem wraps writes in a transaction (commit path)', async () => {
  const calls = [];
  const dbClient = {
    query: async (sql) => {
      const head = String(sql).trim().split(/\s+/).slice(0, 2).join(' ');
      calls.push(head);
      if (String(sql).includes('INSERT INTO products')) {
        return { rows: [{ id: 123 }] };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await __test.importItem(dbClient, makeSampleItem(), null, new Map());

  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'COMMIT');
  assert.equal(calls.includes('ROLLBACK'), false);
});

test('dailySync.importItem rolls back when a write fails', async () => {
  const calls = [];
  const dbClient = {
    query: async (sql) => {
      const head = String(sql).trim().split(/\s+/).slice(0, 2).join(' ');
      calls.push(head);
      if (String(sql).includes('INSERT INTO products')) {
        return { rows: [{ id: 123 }] };
      }
      if (String(sql).includes('INSERT INTO product_skus')) {
        throw new Error('boom');
      }
      return { rows: [], rowCount: 0 };
    },
  };

  await assert.rejects(() => __test.importItem(dbClient, makeSampleItem(), null, new Map()));
  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.includes('ROLLBACK'), true);
  assert.equal(calls.includes('COMMIT'), false);
});

