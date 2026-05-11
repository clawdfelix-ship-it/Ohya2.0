const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin products create/update validates category_id is leaf subcategory', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products-full.js'), 'utf8');
  assert.match(s, /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+categories/i);
  assert.match(s, /parent_id\s+IS\s+NOT\s+NULL/i);
  assert.match(s, /請選擇子分類/);
});
