const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('checkout locks cart rows before creating order', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'orders.js'), 'utf8');
  assert.match(source, /FOR UPDATE OF ci, p/);
});
