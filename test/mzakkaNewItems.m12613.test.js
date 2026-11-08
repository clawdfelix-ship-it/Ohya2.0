const test = require('node:test');
const assert = require('node:assert/strict');

const { parseMzakkaDetailPage } = require('../utils/mzakkaNewItems');
const { extractDescriptionFromDetailHtml } = require('../scripts/fetch-mzakka-description');

// Minimized from the live M12613 PC/SP layout that originally reproduced the
// truncated-description bug. The old item_p04/strong-only parser returned just
// the two summary sentences and the unrelated page footer.
const fixture = `
  <div id="item_data"><table>
    <tr><th>商品名</th><td>Magiceyes 電動アシスト ガチ勃ちリング</td></tr>
    <tr><th>商品番号</th><td>M12613</td></tr>
    <tr><th>販売価格</th><td>2,900円 (税込3,190円)</td></tr>
    <tr><th>出荷</th><td>通常発送</td></tr>
  </table></div>
  <div class="item_info"><b>コックリングも電動アシストの時代です。<br>締め付けと強力振動で性能アップ。</b></div>
  <div class="freehtml"><p class="mini">即日発送：通常、14時までのご注文で当日発送。</p></div>
  <div class="info">
    <h2>商品情報</h2>
    <p><font size="3" color="#ff1493">コックリングも電動アシストの時代です。</font><br><br>
      <font size="2" color="#666666">
        締め付けと強力振動で性能アップ。<br>
        振動パターンも10個ありUSBでの充電式の為、持ち運びも便利。<br>
        本体は肌触りのいいシリコン素材で使いやすく生活防水タイプ。<br>
        USB充電ケーブル付属<br>
        本体サイズ：83×68×22 mm 46g<br>
        外装サイズ：139×83×30 mm 72g<br>
      </font>
    </p>
  </div>
  <table class="item_supple"><tr><td>
    <img src="https://i.mzakka.com/item/M12613/M12613-01-670x.jpg" alt="商品説明画像1">
  </td></tr></table>
  <div>インターネット・FAXによる受付</div>
`;

test('new M-ZAKKA detail layout retains the complete product description', () => {
  const out = parseMzakkaDetailPage(fixture, {
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12613',
    extractDescription: extractDescriptionFromDetailHtml,
  });

  assert.equal(out.id, 'M12613');
  for (const text of [
    '振動パターンも10個ありUSBでの充電式',
    '生活防水タイプ',
    'USB充電ケーブル付属',
    '本体サイズ',
    '外装サイズ',
  ]) {
    assert.match(out.description, new RegExp(text));
  }
  assert.doesNotMatch(out.description, /インターネット・FAXによる受付/);
  assert.doesNotMatch(out.description, /即日発送：通常/);
  assert.equal(out.sections.length, 1, 'do not duplicate the summary and full narrative');
  const narrative = out.sections[0];
  assert.equal(narrative.sourceAnchor, 'item_info');
  assert.match(narrative.contentText, /振動パターンも10個ありUSBでの充電式/);
  assert.match(narrative.contentHtml, /USB充電ケーブル付属/);
});

test('modern narrative HTML cannot inject active content into the product page', () => {
  const html = fixture.replace(
    'USB充電ケーブル付属<br>',
    'USB充電ケーブル付属<script>alert(1)</script><form><input value="bad"></form><iframe src="https://evil.example"></iframe><img src="https://i.mzakka.com/item/M12613/main.jpg" onerror="alert(2)"><br>'
  );
  const out = parseMzakkaDetailPage(html, {
    productUrl: 'https://mzakka.com/pc/detail/item.php?item_id=M12613',
    extractDescription: extractDescriptionFromDetailHtml,
  });
  const narrative = out.sections.find((section) => section.sourceAnchor === 'item_info');
  assert.ok(narrative);
  assert.doesNotMatch(narrative.contentHtml, /<script|<form|<input|<iframe|onerror\s*=/i);
  assert.match(narrative.contentText, /USB充電ケーブル付属/);
});
