const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin products form includes sku management section', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'products.ejs'), 'utf8');
  assert.match(s, /sku-management/);
  assert.match(s, /SKU\s*管理|新增\s*SKU/);
  assert.match(s, /sku-adjust-modal/);
  assert.match(s, /sku-adjust-confirm/);
});
