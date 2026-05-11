const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin warehouses page exists and loads warehouses.js', () => {
  const p = path.join(__dirname, '..', 'views', 'admin', 'warehouses.ejs');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /admin-warehouses/);
  assert.match(s, /\/js\/admin\/warehouses\.js/);
});

test('admin layout contains warehouses nav link', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'layout.ejs'), 'utf8');
  assert.match(s, /href="\/admin\/warehouses"/);
});

test('warehouses.js avoids prompt and wires endpoints', () => {
  const p = path.join(__dirname, '..', 'public', 'js', 'admin', 'warehouses.js');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.doesNotMatch(s, /\bprompt\s*\(/);
  assert.match(s, /\/api\/admin\/warehouses/);
  assert.match(s, /make-default/);
});

