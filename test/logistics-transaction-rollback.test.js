const test = require('node:test');
const assert = require('node:assert/strict');

const logisticsRoutes = require('../routes/logistics');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
    use: () => {},
  };
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
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
    }
  };
}

test('creating purchase order rolls back before returning invalid sku error', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'ROLLBACK') return { rows: [] };
      if (normalized.includes('SELECT id, product_id FROM product_skus')) {
        return { rows: [{ id: 1, product_id: 9 }] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  logisticsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders');
  const handler = route.handlers[route.handlers.length - 1];

  const req = {
    body: {
      supplier_id: 3,
      items: [
        { sku_id: 1, quantity: 2, cost_price: 11 },
        { sku_id: 2, quantity: 1, cost_price: 5 }
      ]
    },
    user: { id: 7 }
  };
  const res = createJsonResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '包含不存在的 sku_id' });
  assert.deepEqual(calls.map((entry) => entry.sql), [
    'BEGIN',
    'SELECT id, product_id FROM product_skus WHERE id = ANY($1::int[])',
    'ROLLBACK'
  ]);
  assert.equal(client.releaseCalled, true);
});

test('receiving purchase order rolls back before returning missing po error', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'ROLLBACK') return { rows: [] };
      if (normalized === 'SELECT id, po_number FROM purchase_orders WHERE id = $1') {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  logisticsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders/:id/receive');
  const handler = route.handlers[route.handlers.length - 1];

  const req = {
    params: { id: '12' },
    body: {
      lines: [{ sku_id: 5, quantity: 1 }]
    }
  };
  const res = createJsonResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: '採購單不存在' });
  assert.deepEqual(calls.map((entry) => entry.sql), [
    'BEGIN',
    'SELECT id, po_number FROM purchase_orders WHERE id = $1',
    'ROLLBACK'
  ]);
  assert.equal(client.releaseCalled, true);
});
