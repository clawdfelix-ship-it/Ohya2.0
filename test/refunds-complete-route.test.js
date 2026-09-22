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

test('refund complete uses cumulative completed refunds to mark order fully refunded', async () => {
  const refundsRoutes = require('../routes/refunds');
  const app = createRouteCapturingApp();
  let updatedPaymentStatus = null;
  const calls = [];
  const client = {
    async query(sql, params) {
      const text = String(sql);
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/SELECT \* FROM refunds WHERE id=\$1 FOR UPDATE/.test(text)) {
        return { rows: [{ id: 9, order_id: 21, amount: '40.00', status: 'approved' }] };
      }
      if (/SELECT id, total_amount FROM orders WHERE id=\$1 FOR UPDATE/.test(text)) {
        return { rows: [{ id: 21, total_amount: '100.00' }] };
      }
      if (/UPDATE refunds[\s\S]*SET status='completed'/.test(text)) {
        return { rows: [{ id: 9, order_id: 21, amount: '40.00', status: 'completed' }] };
      }
      if (/SELECT COALESCE\(SUM\(amount\), 0\) AS total_refunded/.test(text)) {
        return { rows: [{ total_refunded: '100.00' }] };
      }
      if (/UPDATE orders SET payment_status=\$1, updated_at=NOW\(\) WHERE id=\$2/.test(text)) {
        updatedPaymentStatus = params[0];
        return { rows: [] };
      }
      if (/INSERT INTO order_status_histories/.test(text)) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  refundsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: '9' },
    body: { refund_transaction_id: 'rtx-1', payment_transaction_id: 'ptx-1', note: 'ok' },
    user: { id: 88 },
  };
  let jsonPayload = null;
  const res = {
    json(payload) {
      jsonPayload = payload;
      return this;
    },
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    }
  };

  await route.handlers[1](req, res);

  assert.deepEqual(jsonPayload, { success: true });
  assert.equal(updatedPaymentStatus, 'refunded');
  assert.ok(calls.includes('COMMIT'));
});

test('refund complete rejects refunds that are not approved', async () => {
  const refundsRoutes = require('../routes/refunds');
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql) {
      const text = String(sql);
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/SELECT \* FROM refunds WHERE id=\$1 FOR UPDATE/.test(text)) {
        return { rows: [{ id: 9, order_id: 21, amount: '40.00', status: 'rejected' }] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  refundsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: '9' },
    body: { refund_transaction_id: 'rtx-1' },
    user: { id: 88 },
  };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };

  await route.handlers[1](req, res);

  assert.equal(statusCode, 409);
  assert.deepEqual(body, { error: '退款單必須先批准先可完成' });
  assert.ok(calls.includes('ROLLBACK'));
});
