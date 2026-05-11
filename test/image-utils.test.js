const test = require('node:test');
const assert = require('node:assert/strict');

test('toProxyUrl: keeps non-hash URLs unchanged (no fake md5 mapping)', () => {
  const { toProxyUrl } = require('../utils/imageUtils');
  const url = 'https://i.mzakka.com/item/00T096/main.jpg';
  assert.equal(toProxyUrl(url), url);
});

test('toProxyUrl: converts imgs/<hash>.jpg URLs to /image/<hash>', () => {
  const { toProxyUrl } = require('../utils/imageUtils');
  const url = 'https://i.mzakka.com/imgs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg';
  assert.equal(toProxyUrl(url), '/image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

