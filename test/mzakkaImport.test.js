const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('mzakkaImport: extracts category segments and skips pseudo nodes', () => {
  const { buildCategoryNodes, extractCategorySegments, getRootCategoryName, getLeafCategoryName } = require('../utils/mzakkaImport');
  assert.deepEqual(
    extractCategorySegments('新商品・新規取扱商品 > オナホール・おっぱい > M-ZAKKAオリジナル'),
    ['オナホール・おっぱい', 'M-ZAKKAオリジナル']
  );
  assert.equal(getRootCategoryName('新商品・新規取扱商品 > オナホール・おっぱい > M-ZAKKAオリジナル'), 'オナホール・おっぱい');
  assert.equal(getLeafCategoryName('新商品・新規取扱商品 > オナホール・おっぱい > M-ZAKKAオリジナル'), 'M-ZAKKAオリジナル');
  assert.equal(getRootCategoryName('  A  > B  '), 'A');
  assert.equal(getRootCategoryName(''), '未分類');
  assert.equal(getRootCategoryName(null), '未分類');
  assert.deepEqual(buildCategoryNodes('新商品・新規取扱商品 > オナホール・おっぱい > M-ZAKKAオリジナル'), [
    { name: 'オナホール・おっぱい', source_key: 'オナホール・おっぱい', source_parent_key: null, depth: 0 },
    { name: 'M-ZAKKAオリジナル', source_key: 'オナホール・おっぱい > M-ZAKKAオリジナル', source_parent_key: 'オナホール・おっぱい', depth: 1 },
  ]);
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
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=00T096',
  };
  const out = toProductUpsertInput(input, 123);
  assert.equal(out.slug, 'mzakka-00t096');
  assert.equal(out.category_id, 123);
  assert.equal(out.name_zh_hk, 'テスト商品');
  assert.equal(out.description_zh_hk, 'テスト商品');
  assert.equal(out.image_url, 'https://i.mzakka.com/imgs/abc.jpg');
  assert.deepEqual(out.gallery_images, ['https://i.mzakka.com/imgs/abc.jpg']);
  assert.equal(out.source, 'mzakka');
  assert.equal(out.source_key, '00T096');
  assert.equal(out.source_url, 'https://mzakka.com/pc/detail/item.php?item_id=00T096');
  assert.equal(out.sync_status, 'synced');
  assert.ok(out.raw_payload);
});

test('mzakkaImport: maps sku row', () => {
  const { toSkuUpsertInput } = require('../utils/mzakkaImport');
  const out = toSkuUpsertInput({ id: '00T096' }, 77);
  assert.equal(out.sku, '00T096');
  assert.equal(out.product_id, 77);
  assert.deepEqual(out.attributes, {});
});

test('mzakkaImport: builds media rows and product sections rows', () => {
  const { toProductMediaRows, toProductSectionRows } = require('../utils/mzakkaImport');
  const input = {
    id: '00T096',
    name: 'テスト商品',
    images: ['https://i.mzakka.com/imgs/abc.jpg', 'https://i.mzakka.com/imgs/def.jpg'],
    productInfo: [
      { label: '商品番号', value: '00T096' },
      { label: '出荷', value: '通常発送' },
    ],
    sections: [
      {
        sectionType: 'description',
        title: '商品介紹',
        sortOrder: 20,
        contentText: '詳しい紹介',
        contentHtml: '<p>詳しい紹介</p>',
        contentJson: { sectionId: 'item_p04' },
        sourceAnchor: 'item_p04',
      },
    ],
  };
  const mediaRows = toProductMediaRows(input, 42);
  assert.equal(mediaRows.length, 2);
  assert.equal(mediaRows[0].product_id, 42);
  assert.equal(mediaRows[0].sort_order, 0);

  const sectionRows = toProductSectionRows(input, 42);
  assert.equal(sectionRows.length, 2);
  assert.equal(sectionRows[0].section_type, 'product_info');
  assert.match(sectionRows[0].content_text, /商品番号: 00T096/);
  assert.equal(sectionRows[1].source_anchor, 'item_p04');
});

test('import script: can dry-run parse first line without DATABASE_URL', async () => {
  const { dryRunParse } = require('../scripts/import-mzakka-to-postgres');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzakka-import-'));
  const file = path.join(tmpDir, 'products-metadata.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ id: 'M1', name: '測試商品', category: '分類', priceYen: 100 })}\n`, 'utf8');
  const result = await dryRunParse({
    file,
    limit: 1,
  });
  assert.equal(result.linesRead, 1);
  assert.ok(result.sample);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
