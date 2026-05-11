const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('product update must not delete all skus', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.doesNotMatch(s, /DELETE\s+FROM\s+product_skus\s+WHERE\s+product_id\s*=\s*\$1/i);
});

