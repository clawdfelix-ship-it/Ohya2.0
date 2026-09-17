const test = require('node:test');
const assert = require('node:assert/strict');

const {
  translateCategoryName,
  resolveStorefrontCategoryName,
  shouldBackfillCategoryName,
} = require('../utils/categoryTranslations');

test('translateCategoryName translates known generic category labels', () => {
  const out = translateCategoryName('メーカー別');
  assert.equal(out.translatedName, '按品牌');
  assert.equal(out.didTranslate, true);
});

test('translateCategoryName preserves brand names and unknown labels', () => {
  const out = translateCategoryName('タマトイズ/Tamatoys');
  assert.equal(out.translatedName, 'タマトイズ/Tamatoys');
  assert.equal(out.didTranslate, false);
});

test('resolveStorefrontCategoryName prefers existing zh_hk when it differs from source', () => {
  assert.equal(resolveStorefrontCategoryName('メーカー別', '按品牌（人工）'), '按品牌（人工）');
  assert.equal(resolveStorefrontCategoryName('メーカー別', 'メーカー別'), '按品牌');
});

test('shouldBackfillCategoryName only updates safe generic labels', () => {
  assert.equal(shouldBackfillCategoryName('メーカー別', ''), true);
  assert.equal(shouldBackfillCategoryName('メーカー別', 'メーカー別'), true);
  assert.equal(shouldBackfillCategoryName('メーカー別', '按品牌'), false);
  assert.equal(shouldBackfillCategoryName('タマトイズ/Tamatoys', ''), false);
});
