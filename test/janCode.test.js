const test = require('node:test');
const assert = require('node:assert');

const { extractJanCodes, extractPrimaryJan, isValidJan } = require('../utils/janCode');

test('extractJanCodes: 搵出「JANコード：」後嘅 13 位條碼', () => {
  const html = '内容量：100ml<br>JANコード：4571355635590<br>原材料：xxx';
  assert.deepEqual(extractJanCodes(html), ['4571355635590']);
});

test('extractJanCodes: 支援全形冒號、JAN:、JANコード（空白）等變體', () => {
  assert.deepEqual(extractJanCodes('JANコード：4571355639253'), ['4571355639253']);
  assert.deepEqual(extractJanCodes('JAN: 4571355639253'), ['4571355639253']);
  assert.deepEqual(extractJanCodes('janコード 4973540239253'), ['4973540239253']);
  assert.deepEqual(extractJanCodes('ＪＡＮコード：4571355639253'), ['4571355639253']);
});

test('extractJanCodes: 去重並保留出現順序', () => {
  const html = 'JANコード：4571355635590 JANコード：4571355635590 JANコード：4901234567890';
  assert.deepEqual(extractJanCodes(html), ['4571355635590', '4901234567890']);
});

test('extractJanCodes: 冇 JAN label 或冇條碼時回空陣列', () => {
  assert.deepEqual(extractJanCodes('型番 UHTP-361'), []);
  assert.deepEqual(extractJanCodes(''), []);
  assert.deepEqual(extractJanCodes(null), []);
  assert.deepEqual(extractJanCodes('商品番号 M12514'), []);
});

test('extractJanCodes: 唔會誤抓更長數字入面嘅片段（前後須為非數字邊界）', () => {
  assert.deepEqual(extractJanCodes('JANコード：045713556355901'), []);
});

test('isValidJan: 接受日本 45/49 開頭嘅 13 位數字', () => {
  assert.equal(isValidJan('4571355635590'), true);
  assert.equal(isValidJan('4973540239253'), true);
  assert.equal(isValidJan('451234567890'), false); // 12 位
  assert.equal(isValidJan('4601234567890'), false); // 非 45/49
  assert.equal(isValidJan('abcdefghijklm'), false);
});

test('extractPrimaryJan: 回第一個有效 JAN 或 null', () => {
  assert.equal(extractPrimaryJan('JANコード：4571355635590<br>JANコード：4901234567890'), '4571355635590');
  assert.equal(extractPrimaryJan('no code here'), null);
});
