const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin bulk-skus page exists and loads bulk-skus.js', () => {
  const p = path.join(__dirname, '..', 'views', 'admin', 'bulk-skus.ejs');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /admin-bulk-skus/);
  assert.match(s, /\/js\/admin\/bulk-skus\.js/);
});

test('admin layout contains bulk-skus nav link', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'layout.ejs'), 'utf8');
  assert.match(s, /href="\/admin\/bulk-skus"/);
});

test('bulk-skus.js avoids prompt and wires endpoints', () => {
  const p = path.join(__dirname, '..', 'public', 'js', 'admin', 'bulk-skus.js');
  assert.ok(fs.existsSync(p));
  const s = fs.readFileSync(p, 'utf8');
  assert.doesNotMatch(s, /\bprompt\s*\(/);
  assert.match(s, /\/api\/admin\/bulk-skus\/template\.csv/);
  assert.match(s, /\/api\/admin\/bulk-skus\/import/);
});

