const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

function readView(rel) {
  return fs.readFileSync(path.join(__dirname, '..', 'views', ...rel.split('/')), 'utf8');
}

test('product-fulfilment partial exists and uses existing preorder copy', () => {
  const html = readView('partials/product-fulfilment.ejs');
  assert.match(html, /預購/);
  assert.match(html, /10–14/);
});

test('fulfilment partial does not fabricate stock status or hard dates in rendered HTML', () => {
  const file = path.join(__dirname, '..', 'views', 'partials', 'product-fulfilment.ejs');
  const html = ejs.render(readView('partials/product-fulfilment.ejs'), {}, { filename: file });
  // 檢查客人實際見到嘅 HTML，唔掃 EJS 開發註解。
  assert.ok(!/現貨/.test(html), 'should not claim 現貨');
  assert.ok(!/缺貨/.test(html), 'should not claim 缺貨');
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html), 'should not fabricate a hard date');
});

test('homepage latest-products card includes fulfilment partial', () => {
  const html = readView('index.ejs');
  assert.match(html, /product-fulfilment/);
});

test('products list card includes fulfilment partial', () => {
  const html = readView('products.ejs');
  assert.match(html, /product-fulfilment/);
});

test('product detail page reuses fulfilment partial (single source)', () => {
  const html = readView('product.ejs');
  assert.match(html, /product-fulfilment/);
});

test('cart page links freight-collect text to shipping info', () => {
  const html = readView('cart.ejs');
  // 運費到付旁應有 /shipping 連結
  const freightIdx = html.indexOf('到付');
  assert.ok(freightIdx > 0, 'freight-collect text should exist');
  assert.match(html, /\/shipping/);
});

test('cart item rows show preorder hint so customers see it before checkout', () => {
  const html = readView('cart.ejs');
  // renderCart() 嘅 item template 內應該有預購提示
  assert.match(html, /預購/);
});
