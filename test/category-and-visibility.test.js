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
  assert.match(sidebarLeft, /include\('category-tree-node'/, 'sidebar-left should render categories recursively through a dedicated partial');

  const products = readFile(path.join('views', 'products.ejs'));
  assert.match(products, /include\('partials\/category-mobile-drawer'\)/, 'products page should include the mobile category drawer');

  const mobileNode = readFile(path.join('views', 'partials', 'category-mobile-node.ejs'));
  assert.match(mobileNode, /encodeURIComponent\(node\.slug\)/, 'mobile category drawer should link using category.slug');
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
  assert.match(app, /SELECT c\.id,\s*c\.parent_id,/i, 'category tree query should load every active category, not just roots and direct children');
});

test('storefront category tree builder supports arbitrary depth', () => {
  const { buildCategoryTree } = require('../utils/storefrontCategories');
  const built = buildCategoryTree([
    { id: 1, slug: 'root', name: 'Root', count: 10, parentId: null },
    { id: 2, slug: 'child', name: 'Child', count: 6, parentId: 1 },
    { id: 3, slug: 'grandchild', name: 'Grandchild', count: 3, parentId: 2 },
  ], { totalCount: 10 });

  assert.equal(built.tree.length, 1);
  assert.equal(built.tree[0].children[0].children[0].slug, 'grandchild');
  assert.deepEqual(
    built.flat.map((entry) => entry.name),
    ['全部商品', 'Root', 'Root / Child', 'Root / Child / Grandchild']
  );
});

test('admin categories allow multi-level nesting with cycle protection', () => {
  const adminRoutes = readFile(path.join('routes', 'categories.js'));
  assert.match(adminRoutes, /WITH RECURSIVE descendants AS/i, 'admin category update should block cycles using recursive descendant lookup');
  assert.doesNotMatch(adminRoutes, /上級分類必須係大分類/, 'admin categories should no longer force only two levels');
});
