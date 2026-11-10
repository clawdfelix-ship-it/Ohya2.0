const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HAS_HIRAGANA_KATAKANA = /[\u3040-\u30ff]/;

test('sample storefront content does not contain Japanese strings', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sampleProducts = content.slice(
    content.indexOf('function getSampleProducts()'),
    content.indexOf('function getSampleCategories()')
  );
  const sampleCategories = content.slice(
    content.indexOf('function getSampleCategories()'),
    content.indexOf('function formatPrice(')
  );
  const sampleContent = `${sampleProducts}\n${sampleCategories}`;
  assert.equal(HAS_HIRAGANA_KATAKANA.test(sampleContent), false, 'sample storefront content contains hiragana/katakana');

  const forbidden = [
    'メンズケア',
    'アクセサリー',
    'プレミアム',
    'アドバンス',
    'ログイン',
    '新規登録',
  ];
  for (const w of forbidden) {
    assert.equal(content.includes(w), false, `app.js contains ${w}`);
  }
});
