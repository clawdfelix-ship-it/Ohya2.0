const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin low-stock page exists and loads low-stock.js', () => {
  const p = path.join(__dirname, '..', 'views', 'admin', 'low-stock.ejs');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /admin-low-stock/);
  assert.match(s, /\/js\/admin\/low-stock\.js/);
});

test('admin layout contains low-stock nav link', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'layout.ejs'), 'utf8');
  assert.match(s, /href="\/admin\/low-stock"/);
});

test('low-stock.js wires endpoints and avoids prompt', () => {
  const p = path.join(__dirname, '..', 'public', 'js', 'admin', 'low-stock.js');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.doesNotMatch(s, /\bprompt\s*\(/);
  assert.match(s, /\/api\/admin\/low-stock\/skus/);
  assert.match(s, /\/api\/admin\/low-stock\/skus\/export\.csv/);
  assert.match(s, /\/admin\/inventory\?sku_id=/);
});

