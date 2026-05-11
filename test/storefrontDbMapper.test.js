const test = require('node:test');
const assert = require('node:assert/strict');

test('storefrontDbMapper: maps DB product row to storefront product shape', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');

  const out = mapDbProductToStorefrontProduct(
    {
      id: 123,
      name: '商品A',
      description: '介紹A',
      category_name: '分類X',
      price_cents: 298000,
      original_price_cents: null,
      image_url: 'https://i.mzakka.com/item/00T096/main.jpg',
      stock: 7,
    },
    { toProxyUrl: (u) => `/image-proxy/${u}` }
  );

  assert.equal(out.id, 123);
  assert.equal(out.name, '商品A');
  assert.equal(out.description, '介紹A');
  assert.equal(out.category, '分類X');
  assert.equal(out.price, 298000);
  assert.equal(out.originalPrice, null);
  assert.equal(out.stock, 7);
  assert.equal(out.image, '/image-proxy/https://i.mzakka.com/item/00T096/main.jpg');
});

test('storefrontDbMapper: falls back safely when fields are missing', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');

  const out = mapDbProductToStorefrontProduct(
    { id: 1, price_cents: 0 },
    { toProxyUrl: (u) => u }
  );

  assert.equal(out.id, 1);
  assert.equal(out.name, '');
  assert.equal(out.description, '');
  assert.equal(out.category, '未分類');
  assert.equal(out.price, 0);
  assert.equal(out.originalPrice, null);
  assert.equal(out.stock, 0);
  assert.equal(out.image, null);
});

test('storefrontDbMapper: exposes gallery images when gallery_images is present', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');

  const out = mapDbProductToStorefrontProduct(
    {
      id: 9,
      name: '商品B',
      description: '介紹B',
      category_name: '分類Y',
      price_cents: 100,
      original_price_cents: null,
      image_url: 'https://i.mzakka.com/item/AAA/main.jpg',
      gallery_images: [
        'https://i.mzakka.com/item/AAA/main.jpg',
        'https://i.mzakka.com/item/AAA/1.jpg',
        'https://i.mzakka.com/item/AAA/2.jpg',
      ],
      stock: 1,
    },
    { toProxyUrl: (u) => `/p/${u}` }
  );

  assert.deepEqual(out.images, [
    '/p/https://i.mzakka.com/item/AAA/main.jpg',
    '/p/https://i.mzakka.com/item/AAA/1.jpg',
    '/p/https://i.mzakka.com/item/AAA/2.jpg',
  ]);
  assert.equal(out.image, '/p/https://i.mzakka.com/item/AAA/main.jpg');
});

test('storefrontDbMapper: drops non-hash gallery URLs when toProxyUrl cannot proxy them', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');
  const { toProxyUrl } = require('../utils/imageUtils');

  const out = mapDbProductToStorefrontProduct(
    {
      id: 1,
      name: 'X',
      description: 'Y',
      category_name: 'Z',
      price_cents: 1,
      original_price_cents: null,
      image_url: 'https://i.mzakka.com/imgs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
      gallery_images: [
        'https://i.mzakka.com/item/00T096/main.jpg',
        'https://i.mzakka.com/imgs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
        'https://i.mzakka.com/imgs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
      ],
      stock: 1,
    },
    { toProxyUrl }
  );

  assert.deepEqual(out.images, [
    '/image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/image/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ]);
  assert.equal(out.image, '/image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
