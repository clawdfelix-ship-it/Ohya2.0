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

test('refund complete uses cumulative completed refunds when updating payment_status', async () => {
  const app = createRouteCapturingApp();
  let updatedPaymentStatus = null;
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push(String(sql));
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized === 'SELECT * FROM refunds WHERE id=$1') {
        return { rows: [{ id: 9, order_id: 88, amount: 40, status: 'approved' }] };
      }
      if (normalized === 'SELECT id, total_amount FROM orders WHERE id=$1') {
        return { rows: [{ id: 88, total_amount: 100 }] };
      }
      if (normalized.includes("SELECT COALESCE(SUM(amount), 0) AS refunded_total FROM refunds WHERE order_id = $1 AND status = 'completed' AND id <> $2")) {
        return { rows: [{ refunded_total: 60 }] };
      }
      if (normalized.startsWith('UPDATE refunds SET status=')) {
        return { rows: [] };
      }
      if (normalized.startsWith('UPDATE orders SET payment_status=')) {
        updatedPaymentStatus = params[0];
        return { rows: [] };
      }
      if (normalized.startsWith('INSERT INTO order_status_histories')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };

  require('../routes/refunds')(app, pool);
  const route = app.routes.find((entry) => entry.method === 'POST' && entry.path === '/api/admin/refunds/:id/complete');
  assert.ok(route, 'expected refund complete route to be registered');

  const req = {
    params: { id: '9' },
    body: { refund_transaction_id: 'rf_123', payment_transaction_id: 'pay_123' },
    user: { id: 7 },
  };
  let payload = null;
  let statusCode = 200;
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

  assert.equal(statusCode, 200);
  assert.deepEqual(payload, { success: true });
  assert.equal(updatedPaymentStatus, 'refunded');
});
