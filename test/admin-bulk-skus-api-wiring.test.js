const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bulk sku csv endpoints exist and use upload.single', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(s, /\/api\/admin\/bulk-skus\/template\.csv/);
  assert.match(s, /\/api\/admin\/bulk-skus\/import/);
  assert.match(s, /upload\.single\(/);
});

