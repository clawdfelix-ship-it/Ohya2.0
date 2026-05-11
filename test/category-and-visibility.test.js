const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readFile(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('category filter uses category slug (stable, no name mismatch)', () => {
  const app = readFile('app.js');
  assert.match(app, /WHERE\s+slug\s*=\s*\$1/, 'products route should look up category by slug');

  const sidebarLeft = readFile(path.join('views', 'partials', 'sidebar-left.ejs'));
  assert.match(sidebarLeft, /category=<%= encodeURIComponent\(cat\.slug\)/, 'sidebar-left should link using cat.slug');

  const products = readFile(path.join('views', 'products.ejs'));
  assert.match(products, /category=<%= encodeURIComponent\(category\.slug\)/, 'mobile category chips should link using category.slug');
});

test('storefront should not hide products just because zh_hk fields are NULL', () => {
  const app = readFile('app.js');
  assert.doesNotMatch(app, /name_zh_hk\s+IS\s+NOT\s+NULL/i);
  assert.doesNotMatch(app, /description_zh_hk\s+IS\s+NOT\s+NULL/i);
});

