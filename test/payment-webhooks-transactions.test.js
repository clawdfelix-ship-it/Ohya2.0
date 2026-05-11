const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('payment webhooks write payment_transactions (upsert)', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.match(content, /INSERT\s+INTO\s+payment_transactions/i);
  assert.match(content, /ON\s+CONFLICT\s*\(\s*payment_method_code\s*,\s*transaction_id\s*\)/i);
});

