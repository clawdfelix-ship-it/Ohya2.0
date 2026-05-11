const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('purchase-orders page contains item-receiving marker', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'purchase-orders.ejs'), 'utf8');
  assert.match(s, /按 item 收貨|提交收貨入庫/);
});

test('purchase-orders.js still wires receive endpoint', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'purchase-orders.js'), 'utf8');
  assert.match(s, /\/api\/admin\/purchase-orders\/.*\/receive/);
});

