'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');
const session = require('express-session');

test('in-stock category is dynamic and includes only active, available SKUs', () => {
  const {
    IN_STOCK_CATEGORY_SLUG,
    isInStockCategory,
    inStockSqlCondition,
    sampleInStockProducts,
  } = require('../utils/inStock');
  assert.equal(IN_STOCK_CATEGORY_SLUG, 'storefront-stock');
  assert.equal(isInStockCategory('storefront-stock'), true);
  assert.equal(isInStockCategory('storefront-onahole'), false);
  const sql = inStockSqlCondition('p');
  assert.match(sql, /EXISTS/);
  assert.match(sql, /product_skus/);
  assert.match(sql, /ps_stock\.is_active\s*=\s*true/);
  assert.match(sql, /ps_stock\.stock\s*>\s*0/);
  assert.match(sql, /ps_stock\.product_id\s*=\s*p\.id/);
  const available = sampleInStockProducts();
  assert.ok(available.length > 0);
  assert.ok(available.every((product) => product.stock > 0));
});

test('homepage offers a dedicated in-stock section and category URL', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
  assert.match(html, /id="in-stock-products"/);
  assert.match(html, /現貨區/);
  assert.match(html, /category=storefront-stock/);
  assert.match(html, /inStockProducts/);
  assert.match(html, /查看全部現貨/);
});

test('in-stock category is exposed to desktop and mobile special-section navigation', () => {
  const { withInStockSpecial } = require('../utils/inStock');
  const result = withInStockSpecial({
    flat: [{ id: 0, slug: 'all', name: '全部商品', count: 2 }],
    tree: [],
    specials: [{ id: 10, slug: 'storefront-new', name: '新到推介', count: 2 }],
  }, 1);
  assert.equal(result.specials[0].slug, 'storefront-stock');
  assert.equal(result.specials[0].name, '現貨');
  assert.equal(result.specials[0].count, 1);
  assert.equal(result.specials[1].slug, 'storefront-new');
});

function productRow(id, stock) {
  return {
    id, name: `Product ${id}`, description: '', category_name: 'Test',
    price_cents: 1000, original_price_cents: null, image_url: null, stock,
    storefront_categories: [],
  };
}

async function withStorefrontApp(callback) {
  const queries = [];
  const pool = { query: async (sql, params = []) => {
    const compact = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql: compact, params });
    if (/FROM mzakka_home_modules/.test(compact)) return { rows: [] };
    if (/FROM app_settings/.test(compact)) return { rows: [] };
    if (/COUNT\(\*\)::int as total FROM products p/.test(compact) && /ps_stock\.product_id = p\.id/.test(compact)) {
      if (!compact.includes('ps_stock.is_active = true AND ps_stock.stock > 0')) throw new Error('Stock category must use the shared active SKU stock condition');
      return { rows: [{ total: 1 }] };
    }
    if (/COUNT\(\*\)::int as total\s+FROM products/.test(compact)) return { rows: [{ total: 2 }] };
    if (/WITH RECURSIVE direct/.test(compact)) return { rows: [] };
    if (/FROM blog_posts/.test(compact)) return { rows: [] };
    if (/SELECT p\.id,/.test(compact) && /FROM products p/.test(compact)) {
      if (/ps_stock\.product_id = p\.id/.test(compact)) return { rows: [productRow(201, 5)] };
      return { rows: [productRow(201, 5), productRow(202, 0)] };
    }
    if (/FROM new_arrival_rank/.test(compact)) return { rows: [] };
    return { rows: [] };
  } };
  const originalLoad = Module._load;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  let app;
  try {
    process.env.DATABASE_URL = 'postgres://in-stock-test.invalid/ohya';
    process.env.NODE_ENV = 'test';
    Module._load = function (request, parent, isMain) {
      if (request === './utils/getPool') {
        return { getConnectionString: () => process.env.DATABASE_URL, getPool: () => pool };
      }
      if (request === 'connect-pg-simple') return () => session.MemoryStore;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('../app')];
    app = require('../app');
  } finally {
    Module._load = originalLoad;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    await callback(`http://127.0.0.1:${server.address().port}`, queries);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[require.resolve('../app')];
  }
}

test('homepage and stock category render only positive-stock products', { concurrency: false, timeout: 10000 }, async (t) => {
  await withStorefrontApp(async (base, queries) => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /id="in-stock-products"/);
    assert.match(html, /現貨區/);
    assert.match(html, /查看全部現貨/);
    const section = html.split('id="in-stock-products"')[1].split('<section')[0];
    assert.match(section, /Product 201/);
    assert.match(section, /data-fulfilment="in-stock"/);
    assert.doesNotMatch(section, /Product 202/);
    assert.match(html, /data-category-tree-json/);
    const categoryDataMatch = html.match(/<script type="application\/json" data-category-tree-json>([\s\S]*?)<\/script>/);
    assert.ok(categoryDataMatch, 'mobile category data should be present');
    const categoryData = JSON.parse(categoryDataMatch[1]);
    assert.deepEqual(categoryData.specials[0], { id: -4, slug: 'storefront-stock', name: '現貨', count: 1 });
    assert.match(html, /查看全部現貨/);
    const category = await fetch(`${base}/products?category=storefront-stock`);
    assert.equal(category.status, 200);
    const categoryHtml = await category.text();
    assert.match(categoryHtml, /現貨/);
    assert.match(categoryHtml, /Product 201/);
    assert.match(categoryHtml, /data-fulfilment="in-stock"/);
    assert.doesNotMatch(categoryHtml, /data-fulfilment="preorder"/);
    assert.doesNotMatch(categoryHtml, /Product 202/);
    const stockQuery = queries.find((entry) => /COUNT\(\*\)::int as total FROM products p/.test(entry.sql)
      && /ps_stock\.product_id = p\.id/.test(entry.sql)
      && /p\.deleted_at IS NULL/.test(entry.sql));
    assert.match(stockQuery.sql, /ps_stock\.is_active = true/);
    assert.match(stockQuery.sql, /ps_stock\.stock > 0/);
  });
});
