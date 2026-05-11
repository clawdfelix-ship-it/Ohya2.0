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
});

test('productsSort: unknown sort key falls back to recommend and cannot inject SQL', () => {
  const { getProductsOrderBy } = require('../lib/productsSort');
  const input = 'created_at desc; drop table products; --';
  const out = getProductsOrderBy(input);
  assert.match(out, /is_featured/i);
  assert.doesNotMatch(out, /drop\s+table/i);
  assert.doesNotMatch(out, /--/);
});

test('products page renders a functional sort control', () => {
  const html = readView('products.ejs');
  assert.match(html, /<select[^>]*\bid="mz-sort"[^>]*>/, 'products.ejs should include #mz-sort select');
  assert.match(html, /<option[^>]*value="recommend"[^>]*>/, 'products.ejs should include recommend option value');
  assert.match(html, /<option[^>]*value="price_asc"[^>]*>/, 'products.ejs should include price_asc option value');
  assert.match(html, /<option[^>]*value="price_desc"[^>]*>/, 'products.ejs should include price_desc option value');
  assert.match(html, /<option[^>]*value="newest"[^>]*>/, 'products.ejs should include newest option value');
  assert.match(html, /URLSearchParams/, 'products.ejs should update URL params on sort change');
});

test('public products API does not use unsafe ORDER BY interpolation', () => {
  const apiPath = path.join(__dirname, '..', 'routes', 'products-full.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  assert.doesNotMatch(src, /ORDER BY p\.\$\{sort\}/, 'products-full.js should not interpolate sort into SQL');
});
