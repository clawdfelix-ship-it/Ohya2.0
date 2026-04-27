const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('products API queries use zh_hk fields', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'products.js'), 'utf8');
  assert.ok(content.includes('name_zh_hk'), 'routes/products.js must reference name_zh_hk');
  assert.ok(content.includes('description_zh_hk'), 'routes/products.js must reference description_zh_hk');
  assert.ok(content.includes('name_zh_hk as name') || content.includes('AS name'), 'routes/products.js should map zh_hk name to API output');
});
