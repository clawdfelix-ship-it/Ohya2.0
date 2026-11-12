'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { importMzakkaRecords } = require('../scripts/import-mzakka-to-postgres');

function fixture() {
  return {
    id: 'L0450',
    name: 'タフブラック',
    priceYen: 585,
    originalPriceYen: 1650,
    description: 'desc',
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=815&category=2290',
    images: ['https://i.mzakka.com/item/815/main.jpg'],
    productInfo: [],
    sections: [],
    statusText: '販売終了',
    isEnded: true,
  };
}

async function runImport() {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(String(text));
      if (/^INSERT INTO products/.test(text)) return { rows: [{ id: 26026 }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { return client; },
  };
  await importMzakkaRecords({ records: [fixture()], pool, batchSize: 1 });
  return calls;
}

test('mzakka refresh never overwrites positive local SKU stock with zero', async () => {
  const calls = await runImport();
  const sql = calls.find((text) => /^INSERT INTO product_skus/.test(text));
  assert.ok(sql, 'sku upsert should run');
  assert.match(sql, /stock\s*=\s*CASE/i);
  assert.match(sql, /product_skus\.stock\s*>\s*0/);
  assert.match(sql, /THEN\s+product_skus\.stock/i);
  assert.doesNotMatch(sql, /^\s*stock\s*=\s*EXCLUDED\.stock\s*,/m);
});

test('mzakka refresh keeps ended product active while local stock remains', async () => {
  const calls = await runImport();
  const sql = calls.find((text) => /^INSERT INTO products/.test(text));
  assert.ok(sql, 'product upsert should run');
  const statusStart = sql.search(/status\s*=\s*CASE/i);
  assert.ok(statusStart >= 0, 'status rule should be conditional');
  const statusRule = sql.slice(statusStart, sql.indexOf('updated_at', statusStart));
  assert.match(statusRule, /NOT EXISTS/i);
  assert.match(statusRule, /product_skus/i);
  assert.match(statusRule, /stock\s*>\s*0/i);
});
