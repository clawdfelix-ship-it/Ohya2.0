const { test } = require('node:test');
const assert = require('node:assert/strict');

const sm = require('../utils/orderStateMachine');

test('payment: 合法轉態通過', () => {
  assert.equal(sm.transitionPayment('unpaid', 'proof_pending'), 'proof_pending');
  assert.equal(sm.transitionPayment('proof_pending', 'paid'), 'paid');
  assert.equal(sm.transitionPayment('paid', 'partially_refunded'), 'partially_refunded');
  assert.equal(sm.transitionPayment('partially_refunded', 'refunded'), 'refunded');
});

test('payment: 非法跳轉被拒', () => {
  assert.equal(sm.canTransitionPayment('unpaid', 'refunded'), false);
  assert.throws(() => sm.transitionPayment('unpaid', 'paid_fake'), /非法狀態轉換/);
  assert.throws(() => sm.transitionPayment('refunded', 'paid'), /非法狀態轉換/);
});

test('payment: 同態冪等', () => {
  assert.equal(sm.transitionPayment('paid', 'paid'), 'paid');
});

test('fulfillment: 合法鏈路通過', () => {
  assert.equal(sm.transitionFulfillment('unfulfilled', 'shipped'), 'shipped');
  assert.equal(sm.transitionFulfillment('shipped', 'delivered'), 'delivered');
  assert.equal(sm.transitionFulfillment('unfulfilled', 'partially_shipped'), 'partially_shipped');
  assert.equal(sm.transitionFulfillment('partially_shipped', 'shipped'), 'shipped');
});

test('fulfillment: 非法逆向被拒', () => {
  assert.equal(sm.canTransitionFulfillment('delivered', 'shipped'), false);
  assert.throws(() => sm.transitionFulfillment('delivered', 'unfulfilled'), /非法狀態轉換/);
});

test('deriveOrderState: 取消優先', () => {
  assert.equal(
    sm.deriveOrderState({ cancelled: true, payment: 'paid', fulfillment: 'delivered' }),
    'cancelled'
  );
});

test('deriveOrderState: 交付→完成', () => {
  assert.equal(
    sm.deriveOrderState({ payment: 'paid', fulfillment: 'delivered' }),
    'completed'
  );
});

test('deriveOrderState: 出貨中→shipping', () => {
  assert.equal(
    sm.deriveOrderState({ payment: 'paid', fulfillment: 'shipped' }),
    'shipping'
  );
  assert.equal(
    sm.deriveOrderState({ payment: 'paid', fulfillment: 'partially_shipped' }),
    'shipping'
  );
});

test('deriveOrderState: 已付未出→paid', () => {
  assert.equal(
    sm.deriveOrderState({ payment: 'paid', fulfillment: 'unfulfilled' }),
    'paid'
  );
});

test('deriveOrderState: 未付→pending', () => {
  assert.equal(
    sm.deriveOrderState({ payment: 'unpaid', fulfillment: 'unfulfilled' }),
    'pending'
  );
});

test('fromLegacyRow: 映射現有 DB 值', () => {
  assert.deepEqual(sm.fromLegacyRow({ status: 'pending', payment_status: 'pending' }),
    { cancelled: false, payment: 'unpaid', fulfillment: 'unfulfilled', state: 'pending' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'paid', payment_status: 'paid' }),
    { cancelled: false, payment: 'paid', fulfillment: 'unfulfilled', state: 'paid' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'shipping', payment_status: 'paid' }),
    { cancelled: false, payment: 'paid', fulfillment: 'shipped', state: 'shipping' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'completed', payment_status: 'paid' }),
    { cancelled: false, payment: 'paid', fulfillment: 'delivered', state: 'completed' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'cancelled', payment_status: 'pending' }),
    { cancelled: true, payment: 'unpaid', fulfillment: 'unfulfilled', state: 'cancelled' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'pending', payment_status: 'proof_pending' }),
    { cancelled: false, payment: 'proof_pending', fulfillment: 'unfulfilled', state: 'pending' });
});

test('fromLegacyRow: recognizes both partial refund spellings', () => {
  assert.deepEqual(sm.fromLegacyRow({ status: 'paid', payment_status: 'partially_refunded' }),
    { cancelled: false, payment: 'partially_refunded', fulfillment: 'unfulfilled', state: 'paid' });

  assert.deepEqual(sm.fromLegacyRow({ status: 'paid', payment_status: 'partial_refunded' }),
    { cancelled: false, payment: 'partially_refunded', fulfillment: 'unfulfilled', state: 'paid' });
});
