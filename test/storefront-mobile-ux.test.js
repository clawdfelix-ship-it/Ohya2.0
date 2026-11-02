const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('PDP has no enabled inert favorite control', () => {
  const view = read('views/product.ejs');
  assert.doesNotMatch(view, /aria-label="收藏商品"/);
  assert.doesNotMatch(view, /<button[^>]*>\s*❤️\s*<\/button>/);
});

test('mobile PDP renders buying controls before narrative without changing desktop order', () => {
  const view = read('views/product.ejs');
  const purchase = view.indexOf('data-purchase-controls');
  const narrative = view.indexOf('data-product-narrative');
  assert.ok(narrative >= 0, 'narrative wrapper should be identified');
  assert.ok(purchase > narrative, 'existing purchase block should remain in the template');
  assert.match(view, /data-product-narrative[^>]*class="[^"]*order-2[^"]*lg:order-none/);
  assert.match(view, /data-purchase-controls[^>]*class="[^"]*order-1[^"]*lg:order-none/);
  assert.match(view, /id="detail-add-cart"/);
  assert.match(view, /id="quantity"/);
});

test('facet clear preserves category, search and sort, clears only facet state and resets page', () => {
  const { buildFacetClearUrl } = require('../utils/productFilters');
  const url = buildFacetClearUrl({
    category: '情趣用品/震動棒 & 按摩',
    q: '日本 限量&特價',
    sort: 'price_desc',
    minPrice: 100,
    maxPrice: 500,
    inStockOnly: true,
    page: 4,
  });
  const parsed = new URL(url, 'https://ohya.test');
  assert.equal(parsed.pathname, '/products');
  assert.equal(parsed.searchParams.get('category'), '情趣用品/震動棒 & 按摩');
  assert.equal(parsed.searchParams.get('q'), '日本 限量&特價');
  assert.equal(parsed.searchParams.get('sort'), 'price_desc');
  assert.equal(parsed.searchParams.get('page'), '1');
  assert.equal(parsed.searchParams.has('min_price'), false);
  assert.equal(parsed.searchParams.has('max_price'), false);
  assert.equal(parsed.searchParams.has('in_stock'), false);
  assert.match(url, /%26/);
});

test('facet clear omits empty context and resets page', () => {
  const { buildFacetClearUrl } = require('../utils/productFilters');
  assert.equal(buildFacetClearUrl({ category: 'all', q: '  ', sort: '' }), '/products?page=1');
});

test('facet view uses the scoped server-rendered clear URL', () => {
  const view = read('views/products.ejs');
  assert.match(view, /const facetClearUrl = buildFacetClearUrl\(/);
  assert.match(view, /href="<%= facetClearUrl %>"/);
  assert.doesNotMatch(view, /href="\/products\?page=1" class="rounded-full border border-ink-500 px-4 py-2 text-sm text-gray-400/);
});

test('cart quantity and removal controls have at least 44px targets and separation', () => {
  const view = read('views/cart.ejs');
  const quantityButtons = view.match(/<button onclick="updateQuantity\([^>]+>/g) || [];
  assert.equal(quantityButtons.length, 2);
  quantityButtons.forEach(button => {
    assert.match(button, /class="[^"]*(?:h-11|min-h-\[44px\])/);
    assert.match(button, /class="[^"]*(?:w-11|min-w-\[44px\])/);
  });
  assert.match(view, /<button onclick="removeItem\([^>]+class="[^"]*(?:min-h-\[44px\]|h-11)[^"]*(?:min-w-\[44px\]|w-11)/);
});

test('listing density controls and compact detail links have 44px targets', () => {
  const css = read('public/css/touch-ui.css');
  assert.match(css, /\[data-density-set\]\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\[data-density="compact"\][^{]*\.mt-auto > a\s*\{[^}]*min-height:\s*44px;/s);
});

test('homepage browse links and stock checkbox label have 44px mobile targets', () => {
  const home = read('views/index.ejs');
  assert.match(home, /href="\/products\?page=1" class="[^"]*min-h-\[44px\][^"]*"[^>]*>瀏覽全部商品/);
  assert.match(home, /href="\/products\?page=1" class="[^"]*min-h-\[44px\][^"]*"[^>]*>查看全部/);
  const products = read('views/products.ejs');
  assert.match(products, /<label class="[^"]*min-h-\[44px\][^"]*"[^>]*>\s*<input type="checkbox" name="in_stock"/);
});
