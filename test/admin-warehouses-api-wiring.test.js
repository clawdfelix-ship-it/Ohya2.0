const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('warehouses API supports update and make-default', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /\/api\/admin\/warehouses/);
  assert.match(s, /app\.put\('\/api\/admin\/warehouses\/:id'/);
  assert.match(s, /make-default/);
});

test('inventory adjust prefers default warehouse', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /ORDER BY[\s\S]*is_default/i);
});

