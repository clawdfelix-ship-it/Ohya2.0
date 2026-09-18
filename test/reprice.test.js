const test = require('node:test');
const assert = require('node:assert/strict');

const { recomputePrices } = require('../utils/reprice');

// 用 mock pool 驗證重算邏輯，唔依賴真資料庫
function mockPool(products, updates) {
  return {
    async query(sql, params) {
      if (/SELECT id, name/.test(sql)) {
        return { rows: products };
      }
      if (/^UPDATE products SET price/.test(sql)) {
        updates.push(params);
        return { rowCount: 1 };
      }
      throw new Error('unexpected query: ' + sql.slice(0, 40));
    },
  };
}

test('recomputePrices converts raw_payload yen → HKD and updates changed rows', async () => {
  // rate 0.052: 2980 yen = 154.96 HKD
  const products = [
    { id: 1, name: 'A', price: 2980, original_price: null, source: 'mzakka',
      raw_payload: { priceYen: 2980 } },
    { id: 2, name: 'B', price: 5.2, original_price: null, source: 'mzakka',
      raw_payload: { priceYen: 100 } }, // already correct → unchanged
    { id: 3, name: 'C', price: 0, original_price: null, source: 'mzakka',
      raw_payload: {} }, // no yen → skipped
  ];
  const updates = [];
  const pool = mockPool(products, updates);

  const r = await recomputePrices(pool, 0.052, { apply: true });

  assert.equal(r.scanned, 3);
  assert.equal(r.changed, 1);       // only id 1 differs
  assert.equal(r.skipped, 1);       // id 3 no yen
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], [154.96, null, 1]);
});

test('recomputePrices dry-run (apply=false) does not write', async () => {
  const products = [
    { id: 7, name: 'A', price: 9999, original_price: null, source: 'mzakka',
      raw_payload: { priceYen: 1000 } },
  ];
  const updates = [];
  const pool = mockPool(products, updates);

  const r = await recomputePrices(pool, 0.052, { apply: false });
  assert.equal(r.changed, 1);
  assert.equal(updates.length, 0);
});

test('recomputePrices converts original_price too', async () => {
  // 39900 * 0.052 = 2074.8 ; 29900 * 0.052 = 1554.8
  const products = [
    { id: 11, name: 'A', price: 0, original_price: 0, source: 'mzakka',
      raw_payload: { priceYen: 29900, originalPriceYen: 39900 } },
  ];
  const updates = [];
  const pool = mockPool(products, updates);
  await recomputePrices(pool, 0.052, { apply: true });
  assert.deepEqual(updates[0], [1554.8, 2074.8, 11]);
});
