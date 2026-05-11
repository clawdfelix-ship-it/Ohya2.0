const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('purchase-orders page contains sku search marker', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'purchase-orders.ejs'), 'utf8');
  assert.match(s, /搜尋 SKU/);
});

test('purchase-orders.js wires sku search endpoint', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'purchase-orders.js'), 'utf8');
  assert.match(s, /\/api\/admin\/inventory\/skus/);
});

