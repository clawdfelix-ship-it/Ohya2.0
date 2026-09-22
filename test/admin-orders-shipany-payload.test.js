const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin orders ShipAny payload uses order contact fields', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'orders.js'), 'utf8');
  assert.match(s, /recipient_name:\s*o\.contact_name\s*\|\|\s*o\.recipient_name/);
  assert.match(s, /recipient_phone:\s*o\.contact_phone\s*\|\|\s*o\.recipient_phone/);
  assert.match(s, /recipient_address:\s*o\.contact_address\s*\|\|\s*o\.recipient_address/);
  assert.match(s, /recipient_name:\s*order\.contact_name\s*\|\|\s*order\.recipient_name/);
  assert.match(s, /recipient_phone:\s*order\.contact_phone\s*\|\|\s*order\.recipient_phone/);
  assert.match(s, /recipient_address:\s*order\.contact_address\s*\|\|\s*order\.recipient_address/);
});
