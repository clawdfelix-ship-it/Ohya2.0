const test = require('node:test');
const assert = require('node:assert/strict');

const registerRefundRoutes = require('../routes/refunds');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
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

test('completing a refund uses cumulative completed refunds to mark order fully refunded', async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT * FROM refunds WHERE id=$1')) {
        return { rows: [{ id: 9, order_id: 11, amount: 40, status: 'approved' }] };
      }
      if (normalized.startsWith('SELECT id, total_amount FROM orders WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 11, total_amount: 100 }] };
      }
      if (normalized.startsWith('SELECT COALESCE(SUM(amount), 0) AS total_refunded FROM refunds')) {
        return { rows: [{ total_refunded: '60' }] };
      }
      if (normalized.startsWith('UPDATE refunds SET status=')) return { rows: [] };
      if (normalized.startsWith('UPDATE orders SET payment_status=')) return { rows: [] };
      if (normalized.startsWith('INSERT INTO order_status_histories')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  };
  const app = createRouteCapturingApp();

  registerRefundRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[route.handlers.length - 1];

  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return body;
    }
  };

  await handler(
    {
      params: { id: '9' },
      body: { refund_transaction_id: 'rf_1' },
      user: { id: 5 }
    },
    res
  );

  assert.equal(statusCode, 200);
  assert.deepEqual(payload, { success: true });
  assert.equal(released, true);
  const orderUpdate = calls.find((entry) => entry.sql.startsWith('UPDATE orders SET payment_status='));
  assert.ok(orderUpdate, 'expected orders update');
  assert.equal(orderUpdate.params[0], 'refunded');
});
