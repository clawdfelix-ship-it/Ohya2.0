const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('storefront product description prefers non-empty zh_hk, then falls back', () => {
  const appPath = path.join(__dirname, '..', 'app.js');
  const src = fs.readFileSync(appPath, 'utf8');

  assert.match(
    src,
    /COALESCE\(NULLIF\(p\.description_zh_hk, ''\), NULLIF\(p\.description, ''\)\) as description/,
    'app.js should treat empty zh_hk description as NULL so it can fall back to description'
  );

  assert.match(
    src,
    /COALESCE\(NULLIF\(p\.description_zh_hk, ''\), NULLIF\(p\.description, ''\)\) ILIKE/,
    'products search should treat empty zh_hk description as NULL'
  );
});

