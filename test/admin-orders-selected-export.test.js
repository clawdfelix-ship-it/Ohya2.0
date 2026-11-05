const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { buildOrderExportQuery } = require('../lib/orderExportQuery');

function makeApp(rows = [{ id: 42 }]) {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM orders o/.test(sql)) return { rows };
    if (/FROM order_items oi/.test(sql)) return { rows: [] };
    throw new Error('Unexpected query');
  } };
  const app = express();
  app.use((req, res, next) => { req.session = { userId: 1, isAdmin: true }; next(); });
  require('../routes/orders')(app, pool, () => {}, () => {});
  return { app, calls };
}

test('selected-order export requires explicit valid positive IDs', () => {
  assert.throws(() => buildOrderExportQuery([]), /請先勾選要匯出嘅訂單/);
  assert.throws(() => buildOrderExportQuery(['0']), /訂單 ID/);
  assert.throws(() => buildOrderExportQuery(['1.5']), /訂單 ID/);
  assert.throws(() => buildOrderExportQuery(['abc']), /訂單 ID/);
  assert.deepEqual(buildOrderExportQuery(['42', '7', '42']), {
    ids: [42, 7],
    placeholders: '$1,$2',
  });
});

test('bulk export without selected IDs returns 400 and never queries every order', async () => {
  const { app, calls } = makeApp();
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const suffix of ['', '?status=paid&search=Chan']) {
      const response = await fetch(`${base}/api/admin/orders/export.xlsx${suffix}`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: '請先勾選要匯出嘅訂單' });
    }
    assert.equal(calls.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('bulk export queries only the selected order IDs, not status or search filters', async () => {
  const { app, calls } = makeApp();
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/export.xlsx?ids=42&ids=7&ids=42&status=paid&search=Chan`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /filename="selected-orders-2-/);
    assert.match(calls[0].sql, /o\.id = ANY\(\$1::int\[\]\)/);
    assert.deepEqual(calls[0].params, [[42, 7]]);
    assert.doesNotMatch(calls[0].sql, /o\.status =|ILIKE/);
    assert.deepEqual(calls[1].params, [[42]]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('bulk export rejects IDs that do not resolve to orders', async () => {
  const { app, calls } = makeApp([]);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/export.xlsx?ids=999999`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: '搵唔到所選訂單，請刷新後再試' });
    assert.equal(calls.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('selection checkboxes drive the bulk Excel export UI', () => {
  const root = path.join(__dirname, '..');
  const fs = require('node:fs');
  const js = fs.readFileSync(path.join(root, 'public/js/admin/orders.js'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'views/admin/orders.ejs'), 'utf8');
  const handler = js.match(/els\.export\.addEventListener\('click', \(\) => \{[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(handler, /selectedIds/);
  assert.match(handler, /params\.append\('ids', String\(id\)\)/);
  assert.match(handler, /請先勾選要匯出嘅訂單/);
  assert.doesNotMatch(handler, /params\.set\('(?:status|search)'/);
  assert.match(view, /匯出已選訂單 Excel/);
});
