const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRoute(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'routes', name), 'utf8');
}

test('refund and logistics routes write the real order status history table', () => {
  const refunds = readRoute('refunds.js');
  const logistics = readRoute('logistics.js');

  assert.doesNotMatch(refunds, /order_status_histories/i);
  assert.doesNotMatch(logistics, /order_status_histories/i);
  assert.match(refunds, /INSERT\s+INTO\s+order_status_history/i);
  assert.match(logistics, /INSERT\s+INTO\s+order_status_history/i);
});
