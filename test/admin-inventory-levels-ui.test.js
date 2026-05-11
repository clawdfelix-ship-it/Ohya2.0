const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin inventory page contains inventory levels section marker', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'inventory.ejs'), 'utf8');
  assert.match(s, /庫存分佈/);
});

test('inventory.js wires inventory levels endpoint', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'inventory.js'), 'utf8');
  assert.match(s, /\/api\/admin\/inventory\/levels/);
});

