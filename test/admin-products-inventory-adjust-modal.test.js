const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin products sku adjustment uses inline modal (no prompt)', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'products.js'), 'utf8');
  assert.doesNotMatch(s, /\bprompt\s*\(/);
  assert.match(s, /sku-adjust-modal/);
  assert.match(s, /\/api\/admin\/inventory\/adjust/);
});

