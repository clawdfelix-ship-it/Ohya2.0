const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildProductSearchCondition, productSearchLike } = require('../utils/productSearch');

test('product search includes a populated brand and imported source brand aliases', () => {
  const sql = buildProductSearchCondition(2);
  assert.match(sql, /FROM brands ps_brand/);
  assert.match(sql, /ps_brand\.id = p\.brand_id/);
  assert.match(sql, /ps_brand\.name ILIKE \$2 ESCAPE '\\'/);
  assert.match(sql, /p\.source = 'mzakka'/);
  assert.match(sql, /p\.raw_payload->>'category'/);
  assert.match(sql, /regexp_replace/i);
  assert.match(sql, /#0\*39/);
  assert.match(sql, /ESCAPE '\\'/);
});

test('public product API finds a brand that is absent from the product title', async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '123' }] };
    return { rows: [{ id: 36407, name: 'Lace shorts', name_zh_hk: 'Lace shorts' }] };
  } };
  const app = express();
  require('../routes/products')(app, pool, () => {});
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products?search=TOAMI`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pagination.total, 123);
    assert.equal(body.products[0].id, 36407);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assert.equal(queries.length, 2);
  for (const { sql, params } of queries) {
    assert.match(sql, /FROM brands ps_brand/);
    assert.match(sql, /p\.raw_payload->>'category'/);
    assert.deepEqual(params.slice(0, 1), [productSearchLike('TOAMI')]);
  }
});
