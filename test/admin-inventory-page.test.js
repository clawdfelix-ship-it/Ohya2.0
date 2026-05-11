const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin inventory page exists and loads inventory.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'inventory.ejs'), 'utf8');
  assert.match(s, /admin-inventory/);
  assert.match(s, /\/js\/admin\/inventory\.js/);
});

test('admin layout contains inventory nav link', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'layout.ejs'), 'utf8');
  assert.match(s, /href="\/admin\/inventory"/);
});

test('inventory.js wires transactions + sku search + adjust endpoints', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'inventory.js'), 'utf8');
  assert.doesNotMatch(s, /\bprompt\s*\(/);
  assert.match(s, /\/api\/admin\/inventory\/transactions/);
  assert.match(s, /\/api\/admin\/inventory\/skus/);
  assert.match(s, /\/api\/admin\/inventory\/adjust/);
});
