const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
  };
}

function findRoute(app, method, path) {
  const route = app.routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(route, `Missing route ${method} ${path}`);
  return route;
}

test('refund complete rejects refunds that are not approved', async () => {
  const app = createApp();
  let rolledBack = false;

  const client = {
    async query(sql) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text === 'BEGIN') return { rows: [] };
      if (text === 'ROLLBACK') {
        rolledBack = true;
        return { rows: [] };
      }
      if (text === 'SELECT * FROM refunds WHERE id=$1 FOR UPDATE') {
        return { rows: [{ id: 5, order_id: 9, amount: 60, status: 'pending' }] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  require('../routes/refunds')(app, pool);
  const route = findRoute(app, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[1];

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handler({
    params: { id: '5' },
    body: { refund_transaction_id: 'rf-1' },
    user: { id: 7 },
  }, res);

  assert.equal(rolledBack, true);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /不可完成：pending/);
});

test('refund complete uses cumulative completed refunds to mark full refund', async () => {
  const app = createApp();
  let orderPaymentStatus = null;
  let committed = false;

  const client = {
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text === 'BEGIN') return { rows: [] };
      if (text === 'COMMIT') {
        committed = true;
        return { rows: [] };
      }
      if (text === 'ROLLBACK') return { rows: [] };
      if (text === 'SELECT * FROM refunds WHERE id=$1 FOR UPDATE') {
        return { rows: [{ id: 5, order_id: 9, amount: 60, status: 'approved' }] };
      }
      if (text === 'SELECT id, total_amount FROM orders WHERE id=$1 FOR UPDATE') {
        return { rows: [{ id: 9, total_amount: 100 }] };
      }
      if (text.startsWith('SELECT COALESCE(SUM(amount), 0) AS completed_amount FROM refunds')) {
        return { rows: [{ completed_amount: 40 }] };
      }
      if (text.startsWith('UPDATE refunds SET status=\'completed\'')) {
        return { rows: [{ id: 5 }] };
      }
      if (text === 'UPDATE orders SET payment_status=$1, updated_at=NOW() WHERE id=$2') {
        orderPaymentStatus = params[0];
        return { rows: [] };
      }
      if (text.startsWith('INSERT INTO order_status_histories')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  require('../routes/refunds')(app, pool);
  const route = findRoute(app, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[1];

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handler({
    params: { id: '5' },
    body: {
      refund_transaction_id: 'rf-2',
      payment_transaction_id: 'pay-1',
    },
    user: { id: 7 },
  }, res);

  assert.equal(committed, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(orderPaymentStatus, 'refunded');
});
