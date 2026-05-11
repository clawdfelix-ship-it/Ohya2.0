const test = require('node:test');
const assert = require('node:assert/strict');

test('extractMzakkaDescription extracts multi-paragraph text from p04/p05 range', () => {
  const { extractMzakkaDescription, extractPrimaryItemId } = require('../scripts/backfill-mzakka-descriptions');

  const html = `
    <!--p04 =====================================================================================================================-->
    <div id="item_p04">
      <p id="item_p04_SubTitle">商品説明</p>
      <table><tr><td><p>一行A<br>二行B</p></td></tr></table>
    </div>
    <div id="item_p04_1">
      <p>段落C</p>
    </div>
    <!--p05 =====================================================================================================================-->
    <div id="item_p05">
      <p id="item_p05_SubTitle">開発秘話</p>
      <p id="item_p05_txt">段落D</p>
    </div>
    <!--p06 =====================================================================================================================-->
    <div id="item_p06"></div>
    <a href="https://mzakka.com/detail/item.php?item_id=MZA0003">buy</a>
  `;

  const out = extractMzakkaDescription(html);
  assert.match(out, /一行A/);
  assert.match(out, /二行B/);
  assert.match(out, /段落C/);
  assert.match(out, /段落D/);
  assert.doesNotMatch(out, /商品説明/);
  assert.doesNotMatch(out, /開発秘話/);

  assert.equal(extractPrimaryItemId(html), 'MZA0003');
});

