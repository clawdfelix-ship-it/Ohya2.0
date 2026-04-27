const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

const VIEW_FILES = [
  'views/index.ejs',
  'views/products.ejs',
  'views/product.ejs',
  'views/cart.ejs',
  'views/login.ejs',
  'views/register.ejs',
];

const FORBIDDEN_SUBSTRINGS = [
  'lang="ja"',
  'Noto Sans JP',
  '年齢確認',
  'ログイン',
  '検索',
  'はい',
  'いいえ',
  'All rights reserved',
  '对子哈特',
  '对',
];

const HAS_HIRAGANA_KATAKANA = /[\u3040-\u30ff]/;

test('views do not contain Japanese UI strings (hiragana/katakana) or known forbidden phrases', () => {
  for (const f of VIEW_FILES) {
    const content = read(f);
    assert.equal(HAS_HIRAGANA_KATAKANA.test(content), false, `${f} contains hiragana/katakana`);
    for (const s of FORBIDDEN_SUBSTRINGS) {
      assert.equal(content.includes(s), false, `${f} contains forbidden string: ${s}`);
    }
  }
});
