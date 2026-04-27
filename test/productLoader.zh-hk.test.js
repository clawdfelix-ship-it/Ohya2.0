const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('productLoader filters out products missing zh_hk fields', () => {
  const fixture = [
    JSON.stringify({ name: '日文名', category: 'メンズケア', description: '日文描述' }),
    JSON.stringify({ name_zh_hk: '繁中名', category_zh_hk: '男士護理', description_zh_hk: '繁中描述', images: [] }),
  ].join('\n');

  const filePath = path.join(__dirname, 'fixtures.tmp.jsonl');
  fs.writeFileSync(filePath, fixture, 'utf8');

  const { loadProductsFromFile } = require('../utils/productLoader');
  const { products } = loadProductsFromFile(filePath);

  assert.equal(products.length, 1);
  assert.equal(products[0].name, '繁中名');
  assert.equal(products[0].category, '男士護理');
  assert.equal(products[0].description, '繁中描述');

  fs.unlinkSync(filePath);
});
