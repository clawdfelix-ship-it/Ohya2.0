const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('inventory transactions endpoint supports filters with bound params', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /\/api\/admin\/inventory\/transactions/);
  assert.match(s, /req\.query\.sku_id/);
  assert.match(s, /req\.query\.warehouse_id/);
  assert.match(s, /req\.query\.type/);
  assert.match(s, /req\.query\.from/);
  assert.match(s, /req\.query\.to/);
  assert.match(s, /params\.push/);
  assert.match(s, /\$\$\{params\.length \+ 1\}/);
});

test('inventory skus search endpoint exists', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /\/api\/admin\/inventory\/skus/);
  assert.match(s, /ILIKE/);
});

