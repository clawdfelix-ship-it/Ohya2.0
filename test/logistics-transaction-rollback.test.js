const test = require('node:test');
const assert = require('node:assert/strict');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
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

test('purchase-order creation rolls back transaction when request references missing SKU', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT id, product_id')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };

  require('../routes/logistics')(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders');
  const req = {
    body: {
      supplier_id: 1,
      items: [{ sku_id: 1001, quantity: 2, cost_price: 9.5 }],
    },
    user: { id: 42 },
    session: { userId: 42, isAdmin: true },
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
  assert.deepEqual(jsonPayload, { error: '包含不存在的 sku_id' });
  assert.equal(calls.includes('ROLLBACK'), true);
});

test('purchase-order receiving rolls back transaction when received quantity exceeds ordered quantity', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql === 'SELECT id, po_number FROM purchase_orders WHERE id = $1') {
        return { rows: [{ id: 3, po_number: 'PO-20260924-123456' }] };
      }
      if (sql.includes('SELECT id FROM inventory_warehouses WHERE is_active = true')) {
        return { rows: [{ id: 8 }] };
      }
      if (sql.includes('FROM purchase_order_items')) {
        return { rows: [{ id: 4, product_id: 5, quantity: 5, received_quantity: 5 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };

  require('../routes/logistics')(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders/:id/receive');
  const req = {
    params: { id: '3' },
    body: {
      lines: [{ sku_id: 2002, quantity: 1 }],
    },
    user: { id: 21 },
    session: { userId: 21, isAdmin: true },
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
  assert.deepEqual(jsonPayload, { error: 'SKU #2002 收貨數量超過採購數量' });
  assert.equal(calls.includes('ROLLBACK'), true);
  assert.equal(calls.some((sql) => typeof sql === 'string' && sql.includes('UPDATE inventory_levels SET stock')), false);
});
