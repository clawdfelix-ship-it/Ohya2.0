const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin products routes must not be registered by routes/products.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products.js'), 'utf8');
  assert.doesNotMatch(s, /app\.post\('\/api\/admin\/products'\)/);
  assert.doesNotMatch(s, /app\.put\('\/api\/admin\/products\//);
  assert.doesNotMatch(s, /app\.get\('\/api\/admin\/products'\)/);
  assert.doesNotMatch(s, /app\.delete\('\/api\/admin\/products\//);
});

