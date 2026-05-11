const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin reports js wires reports endpoints', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'reports.js'), 'utf8');
  assert.match(s, /\/api\/admin\/dashboard\/overview/);
  assert.match(s, /\/api\/admin\/reports\/sales-by-date/);
  assert.match(s, /\/api\/admin\/reports\/top-products/);
  assert.match(s, /\/api\/admin\/reports\/export-orders\/csv/);
});

