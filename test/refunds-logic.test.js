const test = require('node:test');
const assert = require('node:assert/strict');

test('computePaymentStatusAfterRefund: full refund', () => {
  const { computePaymentStatusAfterRefund } = require('../utils/refundsLogic');
  assert.equal(computePaymentStatusAfterRefund({ orderTotal: 100, refundAmount: 100 }), 'refunded');
});

test('computePaymentStatusAfterRefund: partial refund', () => {
  const { computePaymentStatusAfterRefund } = require('../utils/refundsLogic');
  assert.equal(computePaymentStatusAfterRefund({ orderTotal: 100, refundAmount: 10 }), 'partially_refunded');
});

test('computePaymentStatusAfterRefund: invalid values still preserve partial-refund state name', () => {
  const { computePaymentStatusAfterRefund } = require('../utils/refundsLogic');
  assert.equal(computePaymentStatusAfterRefund({ orderTotal: 'bad', refundAmount: 10 }), 'partially_refunded');
});
