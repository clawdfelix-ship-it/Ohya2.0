const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HAS_HIRAGANA_KATAKANA = /[\u3040-\u30ff]/;

test('app.js does not contain Japanese strings in sample storefront content', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.equal(HAS_HIRAGANA_KATAKANA.test(content), false, 'app.js contains hiragana/katakana');

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
