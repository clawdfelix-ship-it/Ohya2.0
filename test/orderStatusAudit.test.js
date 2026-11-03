const test = require('node:test');
const assert = require('node:assert/strict');

const { writeOrderStatusAudit } = require('../utils/orderStatusAudit');

test('writeOrderStatusAudit uses order_status_history when available', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };

  await writeOrderStatusAudit(db, {
    orderId: 11,
    fromStatus: 'pending',
    toStatus: 'paid',
    note: '付款成功',
    processedBy: 9,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO order_status_history/i);
  assert.deepEqual(calls[0].params, [11, 'pending', 'paid', '付款成功', 9]);
});

test('writeOrderStatusAudit falls back to order_status_histories on legacy schema', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO order_status_history/i.test(sql)) {
        const err = new Error('relation "order_status_history" does not exist');
        err.code = '42P01';
        throw err;
      }
      return { rows: [] };
    }
  };

  await writeOrderStatusAudit(db, {
    orderId: 12,
    toStatus: 'refund_completed',
    note: '退款完成',
    processedBy: 3,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /INSERT INTO order_status_histories/i);
  assert.deepEqual(calls[1].params, [12, 'refund_completed', '退款完成', 3]);
});
