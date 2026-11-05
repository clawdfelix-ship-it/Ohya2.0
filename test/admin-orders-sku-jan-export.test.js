const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');

const order = {
  id: 42, order_number: 'OH-42', created_at: new Date('2026-11-05T10:30:00Z'),
  status: 'paid', payment_status: 'paid', username: 'tester', contact_name: '陳小姐',
};

function harness(itemRows, skuRows = []) {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM orders o/.test(sql)) return { rows: [order] };
    if (/FROM order_items oi/.test(sql)) {
      // The original export only joined oi.sku_id. Reproduce that behavior
      // until the attribute-aware fallback is present in the actual SQL.
      if (!/attribute_matches/.test(sql)) return { rows: itemRows };
      return { rows: itemRows.map(item => {
        const exact = item.sku_id == null ? null : skuRows.find(sku =>
          Number(sku.id) === Number(item.sku_id) && Number(sku.product_id) === Number(item.product_id));
        const attrs = JSON.stringify(item.sku_attributes || {});
        const matching = skuRows.filter(sku => Number(sku.product_id) === Number(item.product_id)
          && (!item.sku_attributes || JSON.stringify(sku.attributes || {}) === attrs));
        const candidates = matching.length ? matching : skuRows.filter(sku => Number(sku.product_id) === Number(item.product_id));
        const fallback = !exact && candidates.length === 1 ? candidates[0] : null;
        const match = exact || fallback;
        return { ...item, sku: match?.sku || null, barcode: match?.barcode || null };
      }) };
    }
    throw new Error('Unexpected query');
  } };
  const app = express();
  app.use((req, res, next) => { req.session = { userId: 1, isAdmin: true }; next(); });
  require('../routes/orders')(app, pool, () => {}, () => {});
  return { app, calls };
}

async function exportedItemRows(itemRows, skuRows) {
  const { app, calls } = harness(itemRows, skuRows);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders/42/export.xlsx`);
    if (response.status !== 200) assert.fail(await response.text());
    assert.equal(response.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet('商品明細');
    return { rows: sheet.getRows(2, sheet.rowCount - 1).map(row => ({
      sku: row.getCell(5).value,
      barcode: row.getCell(6).value,
      attributes: row.getCell(7).value,
    })), calls };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('export matches SKU and JAN by the saved SKU ID, including leading-zero JAN', async () => {
  const { rows, calls } = await exportedItemRows([
    { id: 101, order_id: 42, product_id: 10, sku_id: 902, product_name: '黑色商品', quantity: 1, unit_price: 100 },
  ], [
    { id: 901, product_id: 10, sku: 'RED-SKU', barcode: '1111111111111', attributes: { color: '紅色' } },
    { id: 902, product_id: 10, sku: 'BLACK-SKU', barcode: '0491234567890', attributes: { color: '黑色' } },
  ]);
  assert.deepEqual(rows, [{ sku: 'BLACK-SKU', barcode: '0491234567890', attributes: '' }]);
  assert.match(calls[1].sql, /COALESCE\(exact_sku\.sku/);
  assert.match(calls[1].sql, /COALESCE\(exact_sku\.barcode/);
  assert.match(calls[1].sql, /attribute_matches/);
  assert.match(calls[1].sql, /ps\.attributes::jsonb = oi\.sku_attributes::jsonb/);
  assert.match(calls[1].sql, /oi\.sku_id/);
});

test('old order items without SKU ID fall back to their exact saved attributes', async () => {
  const { rows } = await exportedItemRows([
    { id: 102, order_id: 42, product_id: 10, sku_id: null, product_name: '規格商品', sku_attributes: { color: '黑色' }, quantity: 1, unit_price: 100 },
  ], [
    { id: 901, product_id: 10, sku: 'RED-SKU', barcode: '1111111111111', attributes: { color: '紅色' } },
    { id: 902, product_id: 10, sku: 'BLACK-SKU', barcode: '0491234567890', attributes: { color: '黑色' } },
  ]);
  assert.equal(rows[0].sku, 'BLACK-SKU');
  assert.equal(rows[0].barcode, '0491234567890');
});

test('legacy single-SKU product items get a match but ambiguous variants stay blank', async () => {
  const { rows } = await exportedItemRows([
    { id: 103, order_id: 42, product_id: 10, sku_id: null, product_name: '單規格', quantity: 1, unit_price: 100 },
    { id: 104, order_id: 42, product_id: 20, sku_id: null, product_name: '多規格', quantity: 1, unit_price: 100 },
  ], [
    { id: 901, product_id: 10, sku: 'ONLY-SKU', barcode: '4901234567894', attributes: {} },
    { id: 902, product_id: 20, sku: 'VARIANT-A', barcode: '1111111111111', attributes: { size: 'M' } },
    { id: 903, product_id: 20, sku: 'VARIANT-B', barcode: '2222222222222', attributes: { size: 'L' } },
  ]);
  assert.equal(rows[0].sku, 'ONLY-SKU');
  assert.equal(rows[0].barcode, '4901234567894');
  assert.equal(rows[1].sku, '');
  assert.equal(rows[1].barcode, '');
});
