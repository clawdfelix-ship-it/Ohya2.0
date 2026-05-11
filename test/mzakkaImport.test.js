const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('mzakkaImport: extracts root category name', () => {
  const { getRootCategoryName } = require('../utils/mzakkaImport');
  assert.equal(getRootCategoryName('新商品・新規取扱商品 > M-ZAKKAオリジナル'), '新商品・新規取扱商品');
  assert.equal(getRootCategoryName('  A  > B  '), 'A');
  assert.equal(getRootCategoryName(''), '未分類');
  assert.equal(getRootCategoryName(null), '未分類');
});

test('mzakkaImport: builds stable category slug', () => {
  const { makeCategorySlug } = require('../utils/mzakkaImport');
  const a = makeCategorySlug('新商品・新規取扱商品');
  const b = makeCategorySlug('新商品・新規取扱商品');
  assert.equal(a, b);
  assert.match(a, /^mzakka-cat-[a-f0-9]{16}$/);
});

test('mzakkaImport: builds product slug from mzakka id', () => {
  const { makeProductSlug } = require('../utils/mzakkaImport');
  assert.equal(makeProductSlug('00T096'), 'mzakka-00t096');
});

test('mzakkaImport: maps product row and guarantees description_zh_hk non-empty', () => {
  const { toProductUpsertInput } = require('../utils/mzakkaImport');
  const input = {
    id: '00T096',
    name: 'テスト商品',
    priceYen: 2980,
    originalPriceYen: 3980,
    description: '',
    category: '新商品・新規取扱商品 > M-ZAKKAオリジナル',
    images: ['https://i.mzakka.com/imgs/abc.jpg'],
  };
  const out = toProductUpsertInput(input, 123);
  assert.equal(out.slug, 'mzakka-00t096');
  assert.equal(out.category_id, 123);
  assert.equal(out.name_zh_hk, 'テスト商品');
  assert.equal(out.description_zh_hk, 'テスト商品');
  assert.equal(out.image_url, 'https://i.mzakka.com/imgs/abc.jpg');
  assert.deepEqual(out.gallery_images, ['https://i.mzakka.com/imgs/abc.jpg']);
});

test('mzakkaImport: maps sku row', () => {
  const { toSkuUpsertInput } = require('../utils/mzakkaImport');
  const out = toSkuUpsertInput({ id: '00T096' }, 77);
  assert.equal(out.sku, '00T096');
  assert.equal(out.product_id, 77);
  assert.deepEqual(out.attributes, {});
});

test('import script: can dry-run parse first line without DATABASE_URL', async () => {
  const { dryRunParse } = require('../scripts/import-mzakka-to-postgres');
  const result = await dryRunParse({
    file: path.join(__dirname, '..', '..', 'mzakka-clone', 'products-metadata.jsonl'),
    limit: 1,
  });
  assert.equal(result.linesRead, 1);
  assert.ok(result.sample);
});
