const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', 'views', relPath), 'utf8');
}

test('productsSort: maps known sort keys to safe ORDER BY clause', () => {
  const { getProductsOrderBy } = require('../lib/productsSort');

  assert.match(getProductsOrderBy('recommend'), /is_featured/i);
  assert.match(getProductsOrderBy('price_asc'), /p\.price\s+ASC/i);
  assert.match(getProductsOrderBy('price_desc'), /p\.price\s+DESC/i);
  assert.match(getProductsOrderBy('newest'), /p\.created_at\s+DESC/i);
  assert.match(getProductsOrderBy('popular'), /review_count|average_rating|is_featured/i);
  assert.match(getProductsOrderBy('stock_first'), /COALESCE\(s\.total_stock,\s*0\)\s*>\s*0/i);
});

test('productsSort: stock-first is the default and retains newest order within stock groups', () => {
  const { getProductsOrderBy, normalizeProductsSort, withStockPriority } = require('../lib/productsSort');
  assert.equal(normalizeProductsSort(), 'stock_first');
  assert.equal(normalizeProductsSort(''), 'stock_first');
  assert.equal(normalizeProductsSort('invalid'), 'stock_first');
  assert.equal(normalizeProductsSort('price_asc'), 'price_asc');
  assert.match(getProductsOrderBy('stock_first'), /p\.created_at\s+DESC/i);
  assert.ok(getProductsOrderBy('stock_first').indexOf('s.total_stock') < getProductsOrderBy('stock_first').indexOf('p.created_at'));
  const ranked = withStockPriority('nar.rank NULLS LAST, p.id DESC');
  assert.match(ranked, /s\.total_stock/i);
  assert.match(ranked, /nar\.rank NULLS LAST, p\.id DESC/i);
  assert.ok(ranked.indexOf('s.total_stock') < ranked.indexOf('nar.rank'));
});

test('productsSort: unknown sort key falls back to stock-first and cannot inject SQL', () => {
  const { getProductsOrderBy } = require('../lib/productsSort');
  const input = 'created_at desc; drop table products; --';
  const out = getProductsOrderBy(input);
  assert.match(out, /s\.total_stock/i);
  assert.doesNotMatch(out, /drop\s+table/i);
  assert.doesNotMatch(out, /--/);
});

test('products page renders a functional sort control', () => {
  const html = readView('products.ejs');
  assert.match(html, /<select[^>]*\bid="mz-sort"[^>]*>/, 'products.ejs should include #mz-sort select');
  assert.match(html, /<option[^>]*value="stock_first"[^>]*>[\s\S]*?現貨優先<\/option>/, 'products.ejs should include stock_first option');
  assert.match(html, /sortLabels\s*=\s*\{\s*stock_first:\s*'現貨優先'/);
  assert.match(html, /<option[^>]*value="recommend"[^>]*>/, 'products.ejs should include recommend option value');
  assert.match(html, /<option[^>]*value="price_asc"[^>]*>/, 'products.ejs should include price_asc option value');
  assert.match(html, /<option[^>]*value="price_desc"[^>]*>/, 'products.ejs should include price_desc option value');
  assert.match(html, /<option[^>]*value="newest"[^>]*>/, 'products.ejs should include newest option value');
  assert.match(html, /URLSearchParams/, 'products.ejs should update URL params on sort change');
  assert.match(html, /\['stock_first',\s*'現貨優先'\]/, 'mobile sort sheet should offer stock-first');
  assert.match(html, /get\('sort'\)\s*\|\|\s*'stock_first'/, 'mobile sort sheet should select stock-first by default');
});

test('database category listing orders by active SKU stock before default newest or new-arrival rank', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const route = app.slice(app.indexOf("app.get('/products'"), app.indexOf("app.get('/api/search-suggestions'"));
  assert.ok(route.includes("app.get('/products'"), 'products route should exist');
  assert.match(route, /withStockPriority\('nar\.rank NULLS LAST, p\.id DESC'\)/);
  assert.match(route, /getProductsOrderBy\(sort\)/);
  assert.match(route, /const\s+sort\s*=\s*normalizeProductsSort\(req\.query\.sort\)/);
});

test('public products API does not use unsafe ORDER BY interpolation', () => {
  const apiPath = path.join(__dirname, '..', 'routes', 'products-full.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  assert.doesNotMatch(src, /ORDER BY p\.\$\{sort\}/, 'products-full.js should not interpolate sort into SQL');
});
