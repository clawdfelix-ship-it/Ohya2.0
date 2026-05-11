const test = require('node:test');
const assert = require('node:assert/strict');

test('computeShippingFee: applies free shipping threshold', () => {
  const { computeShippingFee } = require('../utils/shippingAvailability');
  assert.equal(computeShippingFee({ shipping_fee: 20, free_shipping_threshold: 100, min_order_amount: null }, 100), 0);
});

test('computeShippingFee: blocks under min order', () => {
  const { computeShippingFee } = require('../utils/shippingAvailability');
  assert.equal(computeShippingFee({ shipping_fee: 20, free_shipping_threshold: null, min_order_amount: 200 }, 100), null);
});

