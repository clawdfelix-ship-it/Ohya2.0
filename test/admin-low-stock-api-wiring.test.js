const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('low-stock sku endpoints exist', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /\/api\/admin\/low-stock\/skus/);
  assert.match(s, /\/api\/admin\/low-stock\/skus\/export\.csv/);
});

test('low-stock csv sets attachment filename', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /Content-Disposition/);
  assert.match(s, /low-stock-skus/);
});

