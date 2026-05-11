const test = require('node:test');
const assert = require('node:assert/strict');

test('reconcileDaily: classifies matched/missing/mismatch', () => {
  const { reconcileDaily } = require('../utils/reconciliation');

  const orders = [
    { id: 1, total_amount: 100, payment_status: 'paid' },
    { id: 2, total_amount: 200, payment_status: 'paid' },
    { id: 3, total_amount: 300, payment_status: 'paid' },
  ];

  const txs = [
    { order_id: 1, payment_method_code: 'fps_payme', transaction_id: 't1', amount: 100, status: 'success' },
    { order_id: 2, payment_method_code: 'fps_payme', transaction_id: 't2', amount: 199, status: 'success' },
  ];

  const out = reconcileDaily({ orders, transactions: txs });
  assert.equal(out.matched.length, 1);
  assert.equal(out.amount_mismatch.length, 1);
  assert.equal(out.missing_transaction.length, 1);
});

