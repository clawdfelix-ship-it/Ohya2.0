'use strict';
// P0 2026-11-16：公開產品 API 唔准洩露成本／會員價／上游 payload。
//
// 呢個係行為測試（真 express + mock pool + 匿名 HTTP request），
// 唔係齋睇 source code。三條公開 endpoint 逐條打，斷言 response body
// 完全冇敏感欄位，同時零售欄位仍然存在（確保收窄冇整親正常功能）。
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const registerProducts = require('../routes/products-full');
const {
  PUBLIC_PRODUCT_COLUMNS,
  PUBLIC_PRODUCT_SELECT,
  SENSITIVE_PRODUCT_COLUMNS,
} = require('../utils/publicProductColumns');

// 模擬 DB 入面一個**包含成本同上游 payload** 嘅完整 products row。
// 如果路由用返 `p.*`，呢啲欄位就會即刻漏出去。
function sensitiveDbRow() {
  return {
    id: 106703,
    name: 'Fixture product',
    name_zh_hk: '測試商品',
    slug: 'fixture-product',
    description: 'desc',
    description_zh_hk: '描述',
    short_description: 'short',
    short_description_zh_hk: '簡介',
    price: '278.67',
    original_price: '384.38',
    image_url: 'https://i.mzakka.com/item/F12837/main.jpg',
    gallery_images: [],
    video_url: null,
    category_id: 3,
    brand_id: 2,
    category_name: '內衣',
    brand_name: 'Brand',
    product_type: 'physical',
    is_featured: true,
    is_digital: false,
    enable_reviews: true,
    average_rating: '4.5',
    review_count: 2,
    stock: 5,
    status: 'active',
    source: 'mzakka',
    meta_title: null,
    meta_description: null,
    publish_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    total_stock: 5,
    // ↓↓↓ 敏感欄位：絕對唔可以出現喺公開 response ↓↓↓
    cost_price: '120.50',
    member_price: '250.00',
    raw_payload: { priceYen: 5359, originalPriceYen: 7392, productUrl: 'https://mzakka.com/secret' },
    digital_file_url: 'https://cdn.example.com/paid-content.zip',
    sync_status: 'synced',
    deleted_at: null,
    unpublish_at: null,
    meta_keywords: 'internal',
    source_key: 'F12837',
    source_url: 'https://mzakka.com/pc/detail/item.php?item_id=F12837',
    has_batch_expiry: false,
  };
}

function createPool() {
  const calls = [];
  // 模擬真 PostgreSQL：按 SELECT list 投影欄位。
  // 如果 route 用 `SELECT p.*`，就會回全部欄位（包括成本）；
  // 用白名單就只回白名單內嘅欄位。咁先可以真正驅動「洩漏 vs 收窄」嘅分別。
  function projectProductsRow(sql) {
    const row = sensitiveDbRow();
    if (/SELECT\s+p\.\*/.test(sql)) return row;
    const selectPart = sql.slice(sql.toUpperCase().indexOf('SELECT') + 6, sql.toUpperCase().indexOf('FROM'));
    const out = {};
    for (const col of PUBLIC_PRODUCT_COLUMNS) {
      if (new RegExp(`p\\.${col}\\b`).test(selectPart)) out[col] = row[col];
    }
    if (/b\.name as brand_name/.test(selectPart)) out.brand_name = row.brand_name;
    if (/c\.name as category_name/.test(selectPart)) out.category_name = row.category_name;
    return out;
  }
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT COUNT\(\*\) FROM products/.test(sql)) return { rows: [{ count: '1' }] };
      if (/SUM\(stock\) as total_stock FROM product_skus/.test(sql)) return { rows: [{ total_stock: '5' }] };
      if (/FROM product_skus WHERE product_id/.test(sql)) {
        return { rows: [{ id: 1, product_id: 106703, sku: 'SKU1', price: '278.67', stock: 5, is_active: true }] };
      }
      if (/JOIN related_products/.test(sql)) return { rows: [] };
      if (/FROM product_reviews/.test(sql)) return { rows: [] };
      if (/FROM products p/.test(sql)) return { rows: [projectProductsRow(sql)] };
      return { rows: [] };
    },
  };
}

async function startAnonymousApp() {
  const app = express();
  app.use(express.json());
  // 刻意**唔**掛 session middleware：模擬完全匿名訪客。
  const pool = createPool();
  registerProducts(app, pool);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return {
    pool,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function assertNoSensitiveFields(bodyText, label) {
  for (const field of SENSITIVE_PRODUCT_COLUMNS) {
    assert.ok(
      !bodyText.includes(`"${field}"`),
      `${label}: response 唔應該包含敏感欄位 "${field}"`
    );
  }
  // 上游 payload 嘅實際內容亦唔應該以任何形式流出
  assert.ok(!bodyText.includes('priceYen'), `${label}: 唔應該含上游 priceYen`);
  assert.ok(!bodyText.includes('paid-content.zip'), `${label}: 唔應該含 digital_file_url 內容`);
  assert.ok(!bodyText.includes('120.50'), `${label}: 唔應該含成本金額`);
}

test('公開欄位白名單本身唔可以含敏感欄位', () => {
  for (const field of SENSITIVE_PRODUCT_COLUMNS) {
    assert.ok(!PUBLIC_PRODUCT_COLUMNS.includes(field), `白名單唔應該有 ${field}`);
    assert.ok(!PUBLIC_PRODUCT_SELECT.includes(`p.${field},`), `SELECT 唔應該有 p.${field}`);
  }
  assert.ok(!/p\.\*/.test(PUBLIC_PRODUCT_SELECT), 'SELECT 唔應該用 p.*');
  // 必要零售欄位一定要保留
  for (const needed of ['id', 'name', 'slug', 'price', 'original_price', 'image_url', 'stock', 'description']) {
    assert.ok(PUBLIC_PRODUCT_COLUMNS.includes(needed), `白名單缺少必要欄位 ${needed}`);
  }
});

test('匿名 GET /api/products 列表：無成本／會員價／上游 payload', async () => {
  const local = await startAnonymousApp();
  try {
    const res = await fetch(`${local.url}/api/products?page_size=2`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assertNoSensitiveFields(text, '/api/products');
    const body = JSON.parse(text);
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0].price, '278.67');
    assert.equal(body.products[0].name, 'Fixture product');
    assert.equal(body.products[0].category_name, '內衣');
    assert.equal(body.products[0].total_stock, 5);
    // SQL 層已經唔再用 p.*
    const listQuery = local.pool.calls.find((c) => /FROM products p/.test(c.sql) && /LIMIT/.test(c.sql));
    assert.ok(listQuery, '應該有產品列表查詢');
    assert.ok(!/SELECT p\.\*/.test(listQuery.sql), '列表 SQL 唔應該用 SELECT p.*');
  } finally {
    await local.close();
  }
});

test('匿名 GET /api/products/featured：無敏感欄位', async () => {
  const local = await startAnonymousApp();
  try {
    const res = await fetch(`${local.url}/api/products/featured`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assertNoSensitiveFields(text, '/api/products/featured');
    const body = JSON.parse(text);
    assert.equal(body.products[0].is_featured, true);
    const q = local.pool.calls.find((c) => /is_featured = true/.test(c.sql));
    assert.ok(q && !/SELECT p\.\*/.test(q.sql), 'featured SQL 唔應該用 SELECT p.*');
  } finally {
    await local.close();
  }
});

test('對照組：如果 route 用返 SELECT p.*，測試一定要變紅', async () => {
  // 證明呢個測試真係驅動到洩漏，唔係永遠綠嘅假象。
  const pool = createPool();
  const leaky = await pool.query('SELECT p.*, b.name as brand_name FROM products p', []);
  assert.equal(leaky.rows[0].cost_price, '120.50');
  assert.ok(leaky.rows[0].raw_payload);
  assert.throws(() => assertNoSensitiveFields(JSON.stringify(leaky.rows[0]), 'leaky'));
});

test('匿名 GET /api/products/:slug：product 同 skus 都無敏感欄位', async () => {
  const local = await startAnonymousApp();
  try {
    const res = await fetch(`${local.url}/api/products/fixture-product`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assertNoSensitiveFields(text, '/api/products/:slug');
    const body = JSON.parse(text);
    assert.equal(body.product.slug, 'fixture-product');
    assert.equal(body.product.price, '278.67');
    assert.equal(body.product.brand_name, 'Brand');
    assert.ok(Array.isArray(body.skus));
    const q = local.pool.calls.find((c) => /WHERE p\.slug = \$1/.test(c.sql));
    assert.ok(q && !/SELECT p\.\*/.test(q.sql), '單品 SQL 唔應該用 SELECT p.*');
  } finally {
    await local.close();
  }
});

test('admin 專用查詢唔受公開白名單影響（仍可用完整欄位）', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  // 三條公開 endpoint 必須用白名單
  const publicSelects = src.match(/SELECT \$\{PUBLIC_PRODUCT_SELECT\}/g) || [];
  assert.equal(publicSelects.length, 3, '三條公開 endpoint 都要用白名單');
  // admin low-stock 仍然保留 p.*（職員權限需要成本等欄位）
  const adminSection = src.slice(src.indexOf("app.get('/api/admin/products/low-stock'"));
  assert.ok(/SELECT p\.\*/.test(adminSection), 'admin low-stock 應保留完整欄位');
});
