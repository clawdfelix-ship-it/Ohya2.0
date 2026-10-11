const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('payment webhooks write payment_transactions (upsert)', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.match(content, /INSERT\s+INTO\s+payment_transactions/i);
  assert.match(content, /ON\s+CONFLICT\s*\(\s*payment_method_code\s*,\s*transaction_id\s*\)/i);
});

test('payment transaction upsert target is backed by unique indexes in shipped schemas', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const fullSchema = fs.readFileSync(path.join(__dirname, '..', 'schema-full.sql'), 'utf8');
  const expected = /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uniq_payment_transactions_method_tx[\s\S]*?payment_transactions\s*\(\s*payment_method_code\s*,\s*transaction_id\s*\)/i;
  assert.match(schema, expected);
  assert.match(fullSchema, expected);
});
