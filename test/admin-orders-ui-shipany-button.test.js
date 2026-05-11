const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin orders UI wires shipany generate label endpoint', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'orders.js'), 'utf8');
  assert.match(s, /\/api\/admin\/shipany\/generate-label/);
});

test('admin orders details UI contains shipany button marker', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'orders.ejs'), 'utf8');
  assert.match(s, /shipany/i);
});

