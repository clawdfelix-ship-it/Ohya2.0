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
  assert.match(app, /res\.locals\.categoriesTree/, 'storefront should expose category tree locals');

  const sidebarLeft = readFile(path.join('views', 'partials', 'sidebar-left.ejs'));
  assert.match(sidebarLeft, /category=<%= encodeURIComponent\(cat\.slug\)/, 'sidebar-left should link using cat.slug');
  assert.match(sidebarLeft, /category=<%= encodeURIComponent\(child\.slug\)/, 'sidebar-left should link child categories using child.slug');

  const products = readFile(path.join('views', 'products.ejs'));
  assert.match(products, /category=<%= encodeURIComponent\(category\.slug\)/, 'mobile category chips should link using category.slug');
});

test('storefront should not hide products just because zh_hk fields are NULL', () => {
  const app = readFile('app.js');
  assert.doesNotMatch(app, /name_zh_hk\s+IS\s+NOT\s+NULL/i);
  assert.doesNotMatch(app, /description_zh_hk\s+IS\s+NOT\s+NULL/i);
});

test('storefront category filtering and counts recurse through deep descendants', () => {
  const app = readFile('app.js');
  assert.match(app, /WITH RECURSIVE descendants AS/i, 'products route should fetch all descendant category ids');
  assert.match(app, /JOIN descendants d[\s\S]*c\.parent_id = d\.id/i, 'descendant lookup should recurse through every level');
  assert.match(app, /WITH RECURSIVE product_counts AS/i, 'category tree counts should use recursive aggregation');
  assert.match(app, /category_descendants AS/i, 'category count query should build descendant mapping');
  assert.match(app, /child_total\.total_count/i, 'child category counts should include descendant products');
});
