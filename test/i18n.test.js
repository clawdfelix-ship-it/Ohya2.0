const test = require('node:test');
const assert = require('node:assert/strict');

test('t() returns translated string', () => {
  const { createTranslator } = require('../utils/i18n');
  const t = createTranslator({
    locale: 'zh-HK',
    dict: { 'nav.login': '登入' },
  });
  assert.equal(t('nav.login'), '登入');
});

test('t() interpolates params', () => {
  const { createTranslator } = require('../utils/i18n');
  const t = createTranslator({
    locale: 'zh-HK',
    dict: { 'cart.items': '購物車（{count}）' },
  });
  assert.equal(t('cart.items', { count: 3 }), '購物車（3）');
});

test('t() returns key when missing', () => {
  const { createTranslator } = require('../utils/i18n');
  const t = createTranslator({ locale: 'zh-HK', dict: {} });
  assert.equal(t('missing.key'), 'missing.key');
});
