const test = require('node:test');
const assert = require('node:assert/strict');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
  };
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

function lastHandler(route) {
  return route.handlers[route.handlers.length - 1];
}

test('refund completion uses cumulative refunded total before updating order payment status', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT * FROM refunds WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 7, order_id: 11, amount: 40, status: 'approved' }] };
      }
      if (sql.includes('SELECT id, total_amount FROM orders WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 11, total_amount: 100 }] };
      }
      if (sql.includes('SELECT COALESCE(SUM(amount), 0) AS completed_amount')) {
        return { rows: [{ completed_amount: '60' }] };
      }
      if (sql.includes('UPDATE refunds')) return { rows: [] };
      if (sql.includes('UPDATE orders SET payment_status=$1')) return { rows: [] };
      if (sql.includes('INSERT INTO order_status_histories')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };

  require('../routes/refunds')(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: '7' },
    body: { refund_transaction_id: 'rf-123' },
    user: { id: 99 },
    session: { userId: 99, isAdmin: true },
  };
  let jsonPayload = null;
  const res = {
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };

  await lastHandler(route)(req, res);

  assert.deepEqual(jsonPayload, { success: true });
  const updateOrder = queries.find((entry) => entry.sql.includes('UPDATE orders SET payment_status=$1'));
  assert.ok(updateOrder, 'expected order payment status update');
  assert.deepEqual(updateOrder.params, ['refunded', 11]);
  assert.equal(queries.some((entry) => entry.sql === 'COMMIT'), true);
});

test('refund completion rejects non-approved refunds and rolls back', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT * FROM refunds WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 9, order_id: 5, amount: 10, status: 'pending' }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };

  require('../routes/refunds')(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: '9' },
    body: { refund_transaction_id: 'rf-999' },
    user: { id: 77 },
    session: { userId: 77, isAdmin: true },
  };
  let statusCode = null;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };

  await lastHandler(route)(req, res);

  assert.equal(statusCode, 400);
  assert.deepEqual(jsonPayload, { error: '只可完成已批准的退款單' });
  assert.equal(queries.includes('ROLLBACK'), true);
  assert.equal(queries.some((sql) => typeof sql === 'string' && sql.includes('UPDATE orders SET payment_status=$1')), false);
});
