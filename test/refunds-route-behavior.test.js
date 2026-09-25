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

test('refund completion sums prior completed refunds before updating payment status', async () => {
  const refunds = require('../routes/refunds');
  const app = createRouteCapturingApp();
  const updates = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized === 'SELECT * FROM refunds WHERE id=$1') {
        return { rows: [{ id: 8, order_id: 44, amount: 30, status: 'approved' }] };
      }
      if (normalized === 'SELECT id, total_amount FROM orders WHERE id=$1') {
        return { rows: [{ id: 44, total_amount: 100 }] };
      }
      if (normalized.includes('COALESCE(SUM(amount), 0) AS completed_amount')) {
        return { rows: [{ completed_amount: 20 }] };
      }
      if (normalized.startsWith('UPDATE refunds SET status=')) {
        return { rows: [{ id: 8 }] };
      }
      if (normalized.startsWith('UPDATE orders SET payment_status=')) {
        updates.push({ sql: normalized, params });
        return { rows: [] };
      }
      if (normalized.startsWith('INSERT INTO order_status_histories')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };

  refunds(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: 8 },
    body: { refund_transaction_id: 'R-1', payment_transaction_id: 'P-1', note: 'done' },
    user: { id: 3 },
    session: { userId: 3, isAdmin: true, adminPermissions: ['*'] },
  };
  let payload = null;
  const res = {
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  await route.handlers[1](req, res);

  assert.deepEqual(payload, { success: true });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].params, ['partially_refunded', 44]);
});

test('refund completion rejects refunds that would exceed order total', async () => {
  const refunds = require('../routes/refunds');
  const app = createRouteCapturingApp();
  let updateCalled = false;
  const pool = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized === 'SELECT * FROM refunds WHERE id=$1') {
        return { rows: [{ id: 8, order_id: 44, amount: 40, status: 'approved' }] };
      }
      if (normalized === 'SELECT id, total_amount FROM orders WHERE id=$1') {
        return { rows: [{ id: 44, total_amount: 100 }] };
      }
      if (normalized.includes('COALESCE(SUM(amount), 0) AS completed_amount')) {
        return { rows: [{ completed_amount: 70 }] };
      }
      if (normalized.startsWith('UPDATE refunds SET status=') || normalized.startsWith('UPDATE orders SET payment_status=')) {
        updateCalled = true;
        throw new Error('updates must not run on over-refund');
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };

  refunds(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const req = {
    params: { id: 8 },
    body: { refund_transaction_id: 'R-1' },
    user: { id: 3 },
    session: { userId: 3, isAdmin: true, adminPermissions: ['*'] },
  };
  let statusCode = null;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  await route.handlers[1](req, res);

  assert.equal(statusCode, 400);
  assert.deepEqual(payload, { error: '退款金額超過訂單實付' });
  assert.equal(updateCalled, false);
});
