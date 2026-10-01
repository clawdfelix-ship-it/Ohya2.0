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

test('computePaymentStatusAfterRefund: cumulative refunds reaching order total become refunded', () => {
  const { computePaymentStatusAfterRefund } = require('../utils/refundsLogic');
  assert.equal(
    computePaymentStatusAfterRefund({ orderTotal: 100, refundAmount: 40, totalRefundAmount: 100 }),
    'refunded'
  );
});
