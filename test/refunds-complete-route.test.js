const test = require('node:test');
const assert = require('node:assert/strict');

const registerRefundRoutes = require('../routes/refunds');

function createApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
  };
}

function getRoute(app, method, routePath) {
  return app.routes.find((route) => route.method === method && route.path === routePath);
}

function createJsonResponse() {
  return {
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
}

test('refund complete rejects duplicate completion idempotently', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql === 'SELECT * FROM refunds WHERE id=$1 FOR UPDATE') {
        return { rows: [{ id: 5, order_id: 9, status: 'completed', amount: 30 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };
  const app = createApp();
  registerRefundRoutes(app, pool);
  const route = getRoute(app, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[route.handlers.length - 1];
  const res = createJsonResponse();

  await handler(
    {
      params: { id: '5' },
      body: { refund_transaction_id: 'rf_123' },
      user: { id: 1 },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: '退款單已完成' });
  assert.deepEqual(
    calls.map((call) => call.sql),
    ['BEGIN', 'SELECT * FROM refunds WHERE id=$1 FOR UPDATE', 'ROLLBACK']
  );
});
