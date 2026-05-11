const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin purchase-orders page exists and loads purchase-orders.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'purchase-orders.ejs'), 'utf8');
  assert.match(s, /js\/admin\/common\.js/);
  assert.match(s, /js\/admin\/purchase-orders\.js/);
});

