const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { buildOrderWorkbook, safeOrderFilename } = require('../utils/orderExcelExport');

const order = {
  id: 42,
  order_number: 'OH-42',
  created_at: new Date('2026-11-05T10:30:00Z'),
  status: 'paid',
  payment_status: 'paid',
  username: 'tester',
  contact_name: '陳小姐',
  contact_phone: '91234567',
  contact_email: 'buyer@example.com',
  contact_address: '九龍測試地址 1 號',
  district: '九龍',
  subtotal_amount: '250.00',
  shipping_fee: '30.00',
  discount_amount: '10.00',
  coupon_discount: '5.00',
  total_amount: '265.00',
  payment_method_code: 'fps',
  tracking_number: 'SF001',
  note: '測試備註',
};
const item = {
  id: 101,
  order_id: 42,
  product_name: '測試商品',
  quantity: 2,
  unit_price: '125.00',
  subtotal: '250.00',
  sku: 'SKU-001',
  barcode: '4562349710881',
  sku_attributes: { 顏色: '黑色' },
};

function harness() {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM orders o/.test(sql)) return { rows: [order] };
    if (/FROM order_items oi/.test(sql)) return { rows: [item] };
    throw new Error('Unexpected query');
  } };
  const app = express();
  app.use((req, res, next) => { req.session = { userId: 1, isAdmin: true }; next(); });
  require('../routes/orders')(app, pool, () => {}, () => {});
  return { app, calls };
}

test('one-click admin order export returns a real XLSX with orders and item details', async () => {
  const { app, calls } = harness();
  const server = app.listen(0);
  const output = path.join(os.tmpdir(), `ohya-orders-export-${process.pid}.xlsx`);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/export.xlsx?status=paid&search=Chan`);
    if (response.status !== 200) assert.fail(await response.text());
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(response.headers.get('content-disposition'), /attachment; filename="orders-/);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    fs.writeFileSync(output, buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['訂單總覽', '商品明細']);
    assert.equal(workbook.getWorksheet('訂單總覽').getCell('A2').value, 42);
    assert.equal(workbook.getWorksheet('商品明細').getCell('F2').value, '4562349710881');
    assert.equal(workbook.getWorksheet('商品明細').getCell('F2').numFmt, '@');
    assert.equal(workbook.getWorksheet('商品明細').getCell('H2').value, 2);
    assert.equal(calls[0].params[0], 'paid');
    assert.equal(calls[0].params[1], '%Chan%');
    assert.match(calls[1].sql, /oi\.order_id = ANY\(\$1::int\[\]\)/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { force: true });
  }
});

test('single-order export downloads only that order and rejects an unknown order', async () => {
  const { app, calls } = harness();
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/admin/orders/42/export.xlsx`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /filename="order-42\.xlsx"/);
    assert.deepEqual(calls[0].params, [42]);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    const missingPool = { query: async () => ({ rows: [] }) };
    const missingApp = express();
    missingApp.use((req, res, next) => { req.session = { userId: 1, isAdmin: true }; next(); });
    require('../routes/orders')(missingApp, missingPool, () => {}, () => {});
    const missingServer = missingApp.listen(0);
    try {
      const missing = await fetch(`http://127.0.0.1:${missingServer.address().port}/api/admin/orders/999999/export.xlsx`);
      assert.equal(missing.status, 404);
    } finally {
      await new Promise(resolve => missingServer.close(resolve));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('order export rejects unauthenticated and read-only-forbidden users', async () => {
  for (const session of [null, { userId: 2, isBackoffice: true, adminPermissions: [] }]) {
    const app = express();
    app.use((req, res, next) => { req.session = session; next(); });
    const pool = { query: async () => { throw new Error('Denied users must not query orders'); } };
    require('../routes/orders')(app, pool, () => {}, () => {});
    const server = app.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/export.xlsx`);
      assert.equal(response.status, session ? 403 : 401);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('order export has a protected single-order route and visible UI buttons', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'orders.js'), 'utf8');
  assert.match(route, /\/api\/admin\/orders\/export\.xlsx['"]?\s*,\s*requirePermission\('orders:read'\)/);
  assert.match(route, /\/api\/admin\/orders\/:id\/export\.xlsx['"]?\s*,\s*requirePermission\('orders:read'\)/);
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'orders.ejs'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'orders.js'), 'utf8');
  assert.match(view, /id="orders-export"/);
  assert.match(js, /一鍵匯出 Excel/);
  assert.match(js, /export\.xlsx/);
});

test('workbook treats customer text as text rather than executable formulas', async () => {
  const workbook = await buildOrderWorkbook([{ ...order, contact_name: '=2+3', contact_phone: '+85291234567' }], []);
  const sheet = workbook.getWorksheet('訂單總覽');
  assert.equal(sheet.getCell('F2').value, "'=2+3");
  assert.equal(sheet.getCell('G2').value, "'+85291234567");
  assert.equal(safeOrderFilename(42), 'order-42.xlsx');
});
