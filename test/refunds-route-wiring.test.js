const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('refunds route is wired in app.js', () => {
  const routePath = path.join(__dirname, '..', 'routes', 'refunds.js');
  assert.ok(fs.existsSync(routePath), 'routes/refunds.js must exist');

  const appContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appContent, /routes\/refunds/);
});

test('refund completion uses accumulated refunds and tolerates missing payment_transaction_id column', async () => {
  const registerRefundRoutes = require('../routes/refunds');
  const app = createRouteCapturingApp();
  const orderStatusUpdates = [];
  const refundUpdateSql = [];
  const pool = {
    query: async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT * FROM refunds WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 7, order_id: 22, amount: '30.00', status: 'approved' }] };
      }
      if (sql.includes('SELECT id, total_amount FROM orders WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 22, total_amount: '100.00' }] };
      }
      if (sql.includes("SELECT COALESCE(SUM(amount), 0) AS refunded_total")) {
        return { rows: [{ refunded_total: '70.00' }] };
      }
      if (sql.includes("SET status='completed', refund_transaction_id=$1, payment_transaction_id=$2")) {
        refundUpdateSql.push(sql);
        const err = new Error('column "payment_transaction_id" does not exist');
        err.code = '42703';
        throw err;
      }
      if (sql.includes("SET status='completed', refund_transaction_id=$1,")) {
        refundUpdateSql.push(sql);
        return { rows: [] };
      }
      if (sql.includes('UPDATE orders SET payment_status=$1, updated_at=NOW() WHERE id=$2')) {
        orderStatusUpdates.push(params[0]);
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO order_status_histories')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  registerRefundRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[route.handlers.length - 1];
  const req = {
    params: { id: '7' },
    body: { refund_transaction_id: 'rf-1', payment_transaction_id: 'pay-1' },
    user: { id: 5 }
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

  await handler(req, res);

  assert.deepEqual(orderStatusUpdates, ['refunded']);
  assert.equal(refundUpdateSql.length, 2);
  assert.deepEqual(payload, { success: true });
});

test('refund completion rejects an already completed refund before mutating order state', async () => {
  const registerRefundRoutes = require('../routes/refunds');
  const app = createRouteCapturingApp();
  let orderUpdated = false;
  const pool = {
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT * FROM refunds WHERE id=$1 FOR UPDATE')) {
        return { rows: [{ id: 7, order_id: 22, amount: '30.00', status: 'completed' }] };
      }
      if (sql.includes('UPDATE orders SET payment_status=$1')) {
        orderUpdated = true;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  registerRefundRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/refunds/:id/complete');
  const handler = route.handlers[route.handlers.length - 1];
  const req = {
    params: { id: '7' },
    body: { refund_transaction_id: 'rf-1' },
    user: { id: 5 }
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

  await handler(req, res);

  assert.equal(statusCode, 409);
  assert.deepEqual(payload, { error: '退款單已完成' });
  assert.equal(orderUpdated, false);
});
