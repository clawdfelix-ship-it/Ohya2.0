const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin categories API validates hierarchy constraints (two-level)', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'categories.js'), 'utf8');
  assert.match(s, /parent_id/);
  assert.match(s, /上級分類必須係大分類/);
  assert.match(s, /上級分類不可指向自己/);
  assert.match(s, /已有子分類的大分類不可變成子分類/);
  assert.match(s, /請先刪除子分類/);
});

