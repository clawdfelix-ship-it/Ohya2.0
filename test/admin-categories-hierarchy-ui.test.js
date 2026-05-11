const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin categories UI supports parent selector and tree rendering', () => {
  const ejs = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'categories.ejs'), 'utf8');
  assert.match(ejs, /category-parent/);
  assert.match(ejs, /上級分類/);

  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'categories.js'), 'utf8');
  assert.match(js, /parent_id/);
  assert.match(js, /childrenByParentId/);
  assert.match(js, /collapsed/);
  assert.match(js, /新增子分類/);
});

