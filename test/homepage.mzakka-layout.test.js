const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(relPath) {
  const p = path.join(__dirname, '..', 'views', ...relPath.split('/'));
  return fs.readFileSync(p, 'utf8');
}

test('header matches mzakka-like dense layout (search category + q input)', () => {
  const html = readView('partials/header.ejs');
  assert.match(html, /<select[^>]*name="category"/i);
  assert.match(html, /<input[^>]*name="q"/i);
  assert.match(html, />商品分類</);
});

test('homepage has ranking section marker', () => {
  const html = readView('index.ejs');
  assert.match(html, /id="mzakka-ranking"/);
  assert.match(html, />排行榜</);
});

test('homepage renders DB-driven home modules', () => {
  const html = readView('index.ejs');
  assert.match(html, /homeModules/);
  assert.match(html, /module\.image_url/);
});

test('homepageQuery: maps rows to ranking products', () => {
  const { mapRowsToRankingProducts } = require('../utils/homepageQuery');
  const rows = [{ id: 1, name: 'A', description: 'D', category_name: 'C', price_cents: 100, original_price_cents: null, image_url: 'https://i.mzakka.com/x.jpg', stock: 0 }];
  const out = mapRowsToRankingProducts(rows, { toProxyUrl: (u) => `/img/${u}` });
  assert.equal(out[0].image, '/img/https://i.mzakka.com/x.jpg');
});

test('storefrontHomeModules falls back to local center banners', () => {
  const { partitionHomeModules } = require('../utils/storefrontHomeModules');
  const out = partitionHomeModules([]);
  assert.equal(out.center.length, 3);
  assert.match(out.center[0].image_url, /\/assets\/mzakka\/banners\//);
});

test('header has a mobile top-left hamburger button that opens a category menu', () => {
  const html = readView('partials/header.ejs');
  assert.match(html, /data-mobile-menu-open/, 'header should render a mobile menu open button');
  assert.match(html, /id="mz-mobile-menu-panel"/, 'header should render the mobile menu panel');
  assert.match(html, /data-mobile-menu-close/, 'panel should provide a close affordance');
  assert.match(html, /lg:hidden/, 'menu entry should be mobile-only');
  assert.match(html, /categoriesTree/, 'panel should render the global category tree');
});
