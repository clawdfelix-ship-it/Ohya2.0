const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { buildProductSearchCondition, productSearchLike } = require('../utils/productSearch');

test('product search includes SKU and barcode without joining duplicate SKUs', () => {
  const sql = buildProductSearchCondition(1);
  assert.match(sql, /EXISTS \(\s*SELECT 1 FROM product_skus ps_code/);
  assert.match(sql, /ps_code\.sku ILIKE \$1 ESCAPE '\\'/);
  assert.match(sql, /ps_code\.barcode ILIKE \$1 ESCAPE '\\'/);
  assert.doesNotMatch(sql, /JOIN product_skus/);
});

test('product search treats wildcard characters in a product code literally', () => {
  assert.equal(productSearchLike('A_100%'), '%A\\_100\\%%');
});

test('storefront and autocomplete use the shared product-code condition', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(source, /require\('\.\/utils\/productSearch'\)/);
  assert.match(source, /buildProductSearchCondition\(paramIndex\)/);
  assert.match(source, /buildProductSearchCondition\(1\)/);
  assert.match(source, /productSearchLike\(q\)/);
  assert.match(source, /productSearchLike\(term\)/);
});

test('public product API searches by exact product SKU', async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '1' }] };
    return { rows: [{ id: 36868, name: 'Test product', name_zh_hk: 'Test product' }] };
  } };
  const app = express();
  require('../routes/products')(app, pool, () => {});
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products?search=A5257`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pagination.total, 1);
    assert.equal(body.products[0].id, 36868);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  for (const { sql, params } of queries) {
    assert.match(sql, /ps_code\.sku ILIKE \$1/);
    assert.deepEqual(params.slice(0, 1), ['%A5257%']);
  }
});
