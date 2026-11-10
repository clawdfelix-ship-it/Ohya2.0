'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseExpectedVersion,
  validateProductPatch,
  validateSkuPatch,
  validateIdempotencyKey,
  PRODUCT_FIELDS,
} = require('../lib/agentProductValidation');

const { ALL_PRODUCT_SCOPES: allScopes } = require('../lib/agentProductValidation');

test('unknown product fields and wrong field scopes fail closed with 422/403', () => {
  assert.throws(() => validateProductPatch({ orders: [] }, allScopes), (e) => e.status === 422 && e.code === 'UNKNOWN_FIELDS');
  assert.throws(() => validateProductPatch({ price: '2.00' }, ['products:content:write']), (e) => e.status === 403 && e.code === 'SCOPE_REQUIRED' && e.scope === 'products:pricing:write');
  assert.throws(() => validateProductPatch({ cost_price: '2.00' }, allScopes.filter((s) => s !== 'products:cost:write')), (e) => e.status === 403 && e.scope === 'products:cost:write');
  assert.throws(() => validateProductPatch({ wholesale_price_hkd: '2.00' }, allScopes), (e) => e.status === 422, 'unsupported schema must fail closed');
});

test('approved content, media, classification, prices and status produce only explicit updates', () => {
  const out = validateProductPatch({
    name_zh_hk: 'Fixture name', description_zh_hk: 'Plain text',
    category_id: 12, image_url: 'https://i.mzakka.com/imgs/fixture.jpg',
    gallery_images: ['https://i.mzakka.com/imgs/fixture-2.jpg'],
    price: '199.90', original_price: '249.90', member_price: null,
    cost_price: '80.50', status: 'inactive',
  }, allScopes, { allowedImageHosts: ['i.mzakka.com'] });
  assert.equal(out.price, '199.90');
  assert.equal(out.member_price, null);
  assert.equal(out.category_id, 12);
  assert.equal(out.status, 'inactive');
  assert.equal(Object.hasOwn(out, 'stock'), false);
  assert.equal(PRODUCT_FIELDS.member_price, 'pricing');
  assert.throws(() => validateProductPatch({ slug: 'renamed' }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({ brand_id: 2 }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({ is_featured: true }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({}, allScopes), (e) => e.status === 422 && e.code === 'EMPTY_PATCH');
});

test('text is not trusted as HTML and slug/numeric bounds are strict', () => {
  assert.throws(() => validateProductPatch({ description_zh_hk: '<script>alert(1)</script>' }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({ name_zh_hk: '' }, allScopes), (e) => e.status === 422);
  for (const price of [-1, NaN, Infinity, '0.001', '100000000000', '12.3.4', '1e3']) {
    assert.throws(() => validateProductPatch({ price }, allScopes), (e) => e.status === 422, `price ${price}`);
  }
  assert.throws(() => validateProductPatch({ category_id: 0 }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({ status: 'published' }, allScopes), (e) => e.status === 422);
});

test('images allow only HTTPS on explicit host allowlist, no local binary endpoint', () => {
  for (const image_url of ['http://i.mzakka.com/a.jpg', 'https://evil.example/a.jpg', '/images/new.jpg', 'data:image/png;base64,AAAA', 'https://i.mzakka.com@evil.example/a.jpg']) {
    assert.throws(() => validateProductPatch({ image_url }, allScopes, { allowedImageHosts: ['i.mzakka.com'] }), (e) => e.status === 422);
  }
  assert.throws(() => validateProductPatch({ gallery_images: Array.from({ length: 21 }, () => 'https://i.mzakka.com/a.jpg') }, allScopes, { allowedImageHosts: ['i.mzakka.com'] }), (e) => e.status === 422);
  assert.throws(() => validateProductPatch({ video_url: 'https://i.mzakka.com/a.mp4' }, allScopes, { allowedImageHosts: ['i.mzakka.com'] }), (e) => e.status === 422, 'video not in approved first version');
});

test('SKU variants, price/cost/status and bounded stock are independently scoped', () => {
  const out = validateSkuPatch({ barcode: '0049001234567', attributes: { size: 'M', count: 2 }, price: '10.00', stock: 42, is_active: false }, allScopes);
  assert.deepEqual({ ...out.attributes }, { size: 'M', count: 2 });
  assert.equal(out.stock, 42);
  assert.equal(out.is_active, false);
  assert.equal(Object.hasOwn(out, 'sku'), false);
  assert.throws(() => validateSkuPatch({ price: '1.00' }, ['inventory:write']), (e) => e.status === 403 && e.scope === 'products:pricing:write');
  assert.throws(() => validateSkuPatch({ cost_price: '1.00' }, ['inventory:write']), (e) => e.status === 403 && e.scope === 'products:cost:write');
  assert.throws(() => validateSkuPatch({ stock: -1 }, allScopes), (e) => e.status === 422);
  for (const stock of [0.5, '1', 1000001, null]) assert.throws(() => validateSkuPatch({ stock }, allScopes), (e) => e.status === 422);
  assert.throws(() => validateSkuPatch({ attributes: { __proto__: { polluted: true } } }, allScopes), (e) => e.status === 422);
});

test('concurrency and idempotency inputs are required and bounded', () => {
  assert.equal(parseExpectedVersion('2026-11-10T00:00:00.000Z'), '2026-11-10T00:00:00.000Z');
  assert.equal(parseExpectedVersion('"2026-11-10T00:00:00.000Z"'), '2026-11-10T00:00:00.000Z');
  for (const version of [undefined, '', 'not-a-date', '2026-11-10T00:00:00.000Zjunk']) assert.throws(() => parseExpectedVersion(version), (e) => e.status === 428);
  assert.equal(validateIdempotencyKey('fixture-req-001'), 'fixture-req-001');
  for (const key of [undefined, '', 'x'.repeat(129), 'bad\nkey']) assert.throws(() => validateIdempotencyKey(key), (e) => e.status === 400);
});
