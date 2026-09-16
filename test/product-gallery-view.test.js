const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('product page supports gallery thumbnails when product.images exists', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'product.ejs'), 'utf8');
  assert.match(html, /product\.images/, 'product.ejs should reference product.images');
  assert.match(html, /id="mz-product-main-image"/, 'product.ejs should include main image marker');
  assert.match(html, /id="mz-product-thumbs"/, 'product.ejs should include thumbs marker');
});

test('product page renders mzakka product sections when available', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'product.ejs'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(appSrc, /FROM mzakka_product_sections/, 'app.js should load product sections from mzakka_product_sections');
  assert.match(html, /商品情報/, 'product.ejs should render 商品情報 heading');
  assert.match(html, /contentJson\.rows/, 'product.ejs should render product_info rows from contentJson');
  assert.match(html, /section\.contentHtml/, 'product.ejs should support HTML-based detail sections');
});
