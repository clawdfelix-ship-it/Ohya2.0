const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOrderService } = require('../utils/orderService');

// 簡易 in-memory DB，模擬 pg query 介面
function makeDb(initialOrder) {
  const state = {
    orders: new Map([[initialOrder.id, { ...initialOrder }]]),
    history: [],
    fulfillments: [],
    fulfillmentItems: [],
    nextFid: 1,
  };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, status')) {
      return { rows: state.orders.has(params[0]) ? [{ ...state.orders.get(params[0]) }] : [] };
    }
    if (s.startsWith('INSERT INTO order_status_history')) {
      state.history.push({ order_id: params[0], from: params[1], to: params[2], note: params[3], by: params[4] });
      return { rows: [] };
    }
    if (s.startsWith('UPDATE orders SET status=')) {
      const o = state.orders.get(params[1]); if (o) o.status = params[0];
      return { rows: [] };
    }
    if (s.startsWith('UPDATE orders SET payment_status=')) {
      const o = state.orders.get(params[1]); if (o) o.payment_status = params[0];
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO order_fulfillments')) {
      const id = state.nextFid++;
      state.fulfillments.push({ id, order_id: params[0], state: 'shipped' });
      return { rows: [{ id }] };
    }
    if (s.startsWith('INSERT INTO order_fulfillment_items')) {
      state.fulfillmentItems.push({ fid: params[0], item: params[1], qty: params[2] });
      return { rows: [] };
    }
    if (s.startsWith('SELECT (SELECT COALESCE(SUM(quantity),0) FROM order_items')) {
      const ordered = state.orderItemTotal || 0;
      const fulfilled = state.fulfillmentItems.reduce((a, x) => a + x.qty, 0);
      return { rows: [{ ordered, fulfilled }] };
    }
    throw new Error('unhandled SQL: ' + s.slice(0, 70));
  }
  return { query, state };
}

test('confirm payment: payment_status + status 一次更新並寫 history', async () => {
  const db = makeDb({ id: 7, status: 'pending', payment_status: 'pending' });
  const svc = createOrderService(db);
  const state = await svc.transitionPayment(7, 'paid', { note: '確認收款', processedBy: 1 });

  assert.equal(state, 'paid');
  const o = db.state.orders.get(7);
  assert.equal(o.status, 'paid');
  assert.equal(o.payment_status, 'paid');
  assert.equal(db.state.history.length, 1);
  assert.deepEqual(db.state.history[0], { order_id: 7, from: 'pending', to: 'paid', note: '確認收款', by: 1 });
});

test('illegal payment transition throws and writes nothing', async () => {
  const db = makeDb({ id: 8, status: 'pending', payment_status: 'pending' });
  const svc = createOrderService(db);
  await assert.rejects(svc.transitionPayment(8, 'refunded'), /非法狀態轉換/);
  assert.equal(db.state.history.length, 0);
});

test('partial fulfillment → shipping + 出貨單', async () => {
  const db = makeDb({ id: 9, status: 'paid', payment_status: 'paid' });
  db.state.orderItemTotal = 3;
  const svc = createOrderService(db);
  const state = await svc.createFulfillment(9, [{ order_item_id: 100, quantity: 1 }],
    { tracking_number: 'TRACK1' }, { processedBy: 2 });

  assert.equal(state, 'shipping');
  assert.equal(db.state.fulfillments.length, 1);
  assert.equal(db.state.fulfillmentItems.length, 1);
  assert.equal(db.state.orders.get(9).status, 'shipping');
});

test('full fulfillment → shipping (all shipped)', async () => {
  const db = makeDb({ id: 10, status: 'paid', payment_status: 'paid' });
  db.state.orderItemTotal = 2;
  const svc = createOrderService(db);
  const state = await svc.createFulfillment(10,
    [{ order_item_id: 1, quantity: 1 }, { order_item_id: 2, quantity: 1 }], {}, {});
  assert.equal(state, 'shipping');
  assert.equal(db.state.fulfillmentItems.length, 2);
});
