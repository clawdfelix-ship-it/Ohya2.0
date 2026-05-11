const test = require('node:test');
const assert = require('node:assert/strict');

test('mzakkaBreadcrumb: extracts categories from breadcrumb div', () => {
  const { extractBreadcrumbCategoryNames } = require('../utils/mzakkaBreadcrumb');
  const html = `
    <html><body>
      <div id="breadcrumb">
        <a href="category.php?category=1">アダルトグッズ実演販売</a>
        &gt;
        <a href="category.php?category=2">オナホール・おっぱい</a>
      </div>
    </body></html>
  `;
  assert.deepEqual(extractBreadcrumbCategoryNames(html), ['アダルトグッズ実演販売', 'オナホール・おっぱい']);
});

test('mzakkaBreadcrumb: picks root category for sidebar', () => {
  const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');
  const html = `<div id="breadcrumb"><a href="category.php?category=1">コンドーム</a></div>`;
  assert.equal(getRootCategoryNameFromHtml(html), 'コンドーム');
});

test('mzakkaBreadcrumb: skips 新商品・新規取扱商品 and picks the next real category', () => {
  const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');
  const html = `
    <div id="breadcrumb">
      <a href="category.php?category=999">新商品・新規取扱商品</a>
      &gt;
      <a href="category.php?category=1">SM・拘束具</a>
    </div>
  `;
  assert.equal(getRootCategoryNameFromHtml(html), 'SM・拘束具');
});

test('mzakkaBreadcrumb: skips 新商品 and picks the next real category', () => {
  const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');
  const html = `
    <div id="breadcrumb">
      <a href="category.php?category=999">新商品</a>
      &gt;
      <a href="category.php?category=1">SM・拘束具</a>
    </div>
  `;
  assert.equal(getRootCategoryNameFromHtml(html), 'SM・拘束具');
});

test('mzakkaBreadcrumb: skips pseudo categories like 注目商品/ランキング and picks actual category', () => {
  const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');
  const html = `
    <div id="breadcrumb">
      <a href="category.php?category=9">新商品・新規取扱商品</a>
      &gt;
      <a href="category.php?category=8">注目商品</a>
      &gt;
      <a href="category.php?category=7">2020年新春注目商品</a>
      &gt;
      <a href="category.php?category=6">ランキング</a>
      &gt;
      <a href="category.php?category=5">バイブ・電マ・ディルド</a>
      &gt;
      <a href="category.php?category=4">バイブ:ミドル</a>
    </div>
  `;
  assert.equal(getRootCategoryNameFromHtml(html), 'バイブ・電マ・ディルド');
});

test('mzakkaBreadcrumb: falls back to 未分類 when missing', () => {
  const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');
  assert.equal(getRootCategoryNameFromHtml('<html></html>'), '未分類');
});
