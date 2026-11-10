const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin categories API allows multi-level nesting with cycle protection', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'categories.js'), 'utf8');
  assert.match(s, /parent_id/);
  assert.doesNotMatch(s, /上級分類必須係大分類/);
  assert.match(s, /WITH RECURSIVE descendants AS/i);
  assert.match(s, /JOIN descendants d ON c\.parent_id = d\.id/i);
  assert.match(s, /上級分類不可指向自己/);
  assert.match(s, /上級分類不可設定為自己嘅子孫分類/);
  assert.match(s, /請先刪除子分類/);
});

