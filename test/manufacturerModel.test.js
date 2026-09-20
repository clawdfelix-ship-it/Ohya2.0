const test = require('node:test');
const assert = require('node:assert');

const { extractManufacturerModel } = require('../utils/manufacturerModel');

test('由標題結尾抽「字母-數字」型號', () => {
  assert.equal(extractManufacturerModel('グリコケミカル　極　硬の１本     GLCM-002 | M-ZAKKA'), 'GLCM-002');
  assert.equal(extractManufacturerModel('Ligre japan 瞬爆 50ml\tLigre-0238 | M-ZAKKA'), 'Ligre-0238');
});

test('由標題抽「全字母+全數字」相連型號（無連字號）', () => {
  assert.equal(extractManufacturerModel('何か UHTP361 | M-ZAKKA'), 'UHTP361');
});

test('忽略 mzakka 自己商品編號（傳入時唔好當型號）', () => {
  assert.equal(extractManufacturerModel('商品 L5337', { ownCode: 'L5337' }), null);
});

test('型號前有品牌名帶空格：仍取最後一個合資格 token', () => {
  assert.equal(extractManufacturerModel('潮 SPLASH ACJN-094 | x'), 'ACJN-094');
});

test('冇型號（純日文名）回 null', () => {
  assert.equal(extractManufacturerModel('絶硬長！極硬液 | M-ZAKKA'), null);
  assert.equal(extractManufacturerModel('オールナイトチャージ | x'), null);
  assert.equal(extractManufacturerModel(''), null);
  assert.equal(extractManufacturerModel(null), null);
});

test('唔好被容量「50ml」「100ml」誤導', () => {
  assert.equal(extractManufacturerModel('侍（サムライ）50ml | x'), null);
});

test('fallback：型號喺名中間（括號/空格包圍）都搵到', () => {
  assert.equal(extractManufacturerModel('何か TYPE-AB1 追加 | x'), 'TYPE-AB1');
});
