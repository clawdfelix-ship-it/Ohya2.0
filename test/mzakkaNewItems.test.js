const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseMzakkaHomePage,
  parseMzakkaCategoryPage,
  parseMzakkaDetailPage,
} = require('../utils/mzakkaNewItems');
const {
  buildCategoryPageUrl,
  loadSeenIds,
  toJsonlRecord,
} = require('../scripts/crawl-mzakka-new-items');
const { extractDescriptionFromDetailHtml } = require('../scripts/fetch-mzakka-description');

test('parseMzakkaCategoryPage extracts products, prices, stock and pagination', () => {
  const html = `
    <html><head>
      <link rel="canonical" href="https://mzakka.com/pc/detail/category.php?category=1894&p1=0" />
      <link rel="next" href="https://mzakka.com/pc/detail/category.php?category=1894&p1=1" />
    </head><body>
      <a href="https://mzakka.com/pc/detail/category.php?category=1894&p1=3">最後</a>
      <ul>
        <li style="position: relative;">
          <a href="https://mzakka.com/pc/detail/item.php?item_id=M12519&category=1894">
            <img src="https://i.mzakka.com/item/M12519/list.jpg" alt="皆月ひかるの極穴 新商品" />
          </a>
          <h3><a href="https://mzakka.com/pc/detail/item.php?item_id=M12519&category=1894">皆月ひかるの極穴 GODS-922</a></h3>
          <p>ミニマムつるぺた女子の新作。</p>
          <p class="stock">【予約限定30ポイント還元！・9月29日頃発送予定】</p>
          <p class="price">1,650円&#8594;<strong>957円</strong></p>
        </li>
        <li class="none" style="position: relative;">
          <a href="https://mzakka.com/pc/detail/item.php?item_id=A5320&category=1894">
            <img src="https://i.mzakka.com/item/A5320/list.jpg" alt="SMVIP PUアイマスク 新商品" />
          </a>
          <h3><a href="https://mzakka.com/pc/detail/item.php?item_id=A5320&category=1894">SMVIP PUアイマスク</a></h3>
          <p>ソフトなPU素材で優しいつけ心地。</p>
          <p class="stock">通常発送</p>
          <p class="price"><strong>990円</strong></p>
        </li>
      </ul>
    </body></html>
  `;

  const out = parseMzakkaCategoryPage(html);
  assert.equal(out.currentPage, 1);
  assert.equal(out.totalPages, 4);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.items[0], {
    id: 'M12519',
    name: '皆月ひかるの極穴 GODS-922',
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12519&category=1894',
    imageUrl: 'https://i.mzakka.com/item/M12519/list.jpg',
    summary: 'ミニマムつるぺた女子の新作。',
    statusText: '【予約限定30ポイント還元！・9月29日頃発送予定】',
    priceYen: 957,
    originalPriceYen: 1650,
  });
  assert.equal(out.items[1].id, 'A5320');
  assert.equal(out.items[1].priceYen, 990);
  assert.equal(out.items[1].originalPriceYen, null);
});

test('parseMzakkaDetailPage extracts item fields, cleans categories and keeps same-item images', () => {
  const html = `
    <html><head>
      <meta name="thumbnail" content="https://i.mzakka.com/item/M12521/main.jpg" />
    </head><body>
      <div id="breadcrumb">
        <a href="category.php?category=1789">新商品・新規取扱商品</a>
        &gt;
        <a href="category.php?category=1801">オナホール・おっぱい</a>
        &gt;
        <a href="category.php?category=1934">メーカー別</a>
        &gt;
        <a href="category.php?category=1936">Toy's Heart（トイズハート）</a>
      </div>
      <div id="item_image">
        <img src="https://i.mzakka.com/item/M12521/main.jpg" alt="月野かすみの極穴" />
        <img src="https://i.mzakka.com/item/M12521/M12521-01-670x.jpg" alt="月野かすみの極穴 1" />
        <img src="https://i.mzakka.com/item/M12521/M12521-02-670x.jpg" alt="月野かすみの極穴 2" />
        <a href="https://mzakka.com/pc/detail/item.php?item_id=M12520"><img src="https://i.mzakka.com/item/M12520/list.jpg" alt="related" /></a>
      </div>
      <div id="item_data">
        <table>
          <tr><th style="width:8em;">商品名</th><td class="item_name">月野かすみの極穴 GODS-924</td></tr>
          <tr><th>商品番号</th><td>M12521</td></tr>
          <tr><th>販売価格</th><td class="price"><strong>870円<span>(税込957円)</span></strong></td></tr>
          <tr><th>出荷</th><td>【予約限定30ポイント還元！・9月29日頃発送予定】</td></tr>
          <tr><th>定価</th><td class="fixed_price">1,650円</td></tr>
        </table>
      </div>
      <div id="item_p04">
        <p id="item_p04_SubTitle">商品説明</p>
        <table><tr><td><p>ふわふわ系ダウナーお姉さん。</p></td></tr></table>
      </div>
      <div id="item_p04_1"><p>むにゅむにゅ極上爆ヌキホール！</p></div>
      <div id="item_p05"><p id="item_p05_SubTitle">開発秘話</p></div>
      <div id="item_p06"></div>
    </body></html>
  `;

  const out = parseMzakkaDetailPage(html, {
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12521',
    extractDescription: extractDescriptionFromDetailHtml,
  });
  assert.equal(out.id, 'M12521');
  assert.equal(out.name, '月野かすみの極穴 GODS-924');
  assert.equal(out.priceYen, 957);
  assert.equal(out.originalPriceYen, 1650);
  assert.equal(out.category, "オナホール・おっぱい > メーカー別 > Toy's Heart（トイズハート）");
  assert.deepEqual(out.images, [
    'https://i.mzakka.com/item/M12521/main.jpg',
    'https://i.mzakka.com/item/M12521/M12521-01-670x.jpg',
    'https://i.mzakka.com/item/M12521/M12521-02-670x.jpg',
  ]);
  assert.deepEqual(out.productInfo.slice(0, 3), [
    { label: '商品名', value: '月野かすみの極穴 GODS-924' },
    { label: '商品番号', value: 'M12521' },
    { label: '販売価格', value: '870円 (税込957円)' },
  ]);
  assert.equal(out.sections[0].sectionType, 'description');
  assert.equal(out.sections[1].sourceAnchor, 'item_p04');
  assert.match(out.description, /ふわふわ系ダウナー/);
  assert.match(out.description, /むにゅむにゅ極上爆ヌキホール/);
  assert.equal(out.isEnded, false);
});

test('parseMzakkaHomePage extracts linked image modules from homepage html', () => {
  const html = `
    <html><body>
      <div>【新作入荷!!】注目キャンペーン</div>
      <a href="https://mzakka.com/pc/detail/category.php?category=1962">
        <img src="https://i.mzakka.com/free/banner-1.jpg" alt="ローションプレゼントキャンペーン" />
      </a>
      <div>特集ページ</div>
      <a href="/pc/detail/special2.php?sp_id=265">
        <img src="https://i.mzakka.com/free/feature-360.jpg" />
      </a>
    </body></html>
  `;

  const out = parseMzakkaHomePage(html);
  assert.equal(out.modules.length, 2);
  assert.equal(out.modules[0].title, 'ローションプレゼントキャンペーン');
  assert.equal(out.modules[0].moduleType, 'banner');
  assert.equal(out.modules[1].moduleType, 'feature_banner');
  assert.match(out.modules[1].targetUrl, /special2\.php\?sp_id=265/);
});

test('buildCategoryPageUrl uses zero-based p1 query', () => {
  assert.equal(
    buildCategoryPageUrl(1894, 1),
    'https://mzakka.com/pc/detail/category.php?category=1894&p1=0'
  );
  assert.equal(
    buildCategoryPageUrl(1894, 3),
    'https://mzakka.com/pc/detail/category.php?category=1894&p1=2'
  );
});

test('loadSeenIds reads JSONL ids and ignores malformed lines', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzakka-seen-'));
  const file = path.join(dir, 'seen.jsonl');
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ id: 'M12521' }),
      'not-json',
      JSON.stringify({ id: 'A5320' }),
      '',
    ].join('\n'),
    'utf8'
  );

  const out = await loadSeenIds(file);
  assert.deepEqual(Array.from(out).sort(), ['A5320', 'M12521']);
});

test('toJsonlRecord prefers detail data and falls back to list data', () => {
  const out = toJsonlRecord(
    {
      id: 'M12521',
      name: 'list name',
      summary: 'list summary',
      imageUrl: 'https://i.mzakka.com/item/M12521/list.jpg',
      productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12521',
      statusText: '通常発送',
      priceYen: 957,
      originalPriceYen: 1650,
    },
    {
      id: 'M12521',
      name: 'detail name',
      description: 'detail desc',
      category: 'オナホール・おっぱい',
      priceYen: 957,
      originalPriceYen: 1650,
      images: ['https://i.mzakka.com/item/M12521/main.jpg'],
      productInfo: [{ label: '商品番号', value: 'M12521' }],
      sections: [{ sectionType: 'description', title: '商品介紹', contentText: 'detail desc' }],
      productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12521',
      statusText: '予約商品',
    }
  );

  assert.deepEqual(out, {
    id: 'M12521',
    name: 'detail name',
    description: 'detail desc',
    category: 'オナホール・おっぱい',
    priceYen: 957,
    originalPriceYen: 1650,
    images: ['https://i.mzakka.com/item/M12521/main.jpg'],
    productInfo: [{ label: '商品番号', value: 'M12521' }],
    sections: [{ sectionType: 'description', title: '商品介紹', contentText: 'detail desc' }],
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12521',
    statusText: '予約商品',
  });
});
