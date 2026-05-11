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

