const test = require('node:test');
const assert = require('node:assert/strict');

const logisticsRoutes = require('../routes/logistics');
const adminRoutes = require('../routes/admin');

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
    body: undefined,
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

test('purchase order creation rolls back before returning 400 on missing sku ids', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    query: async (sql) => {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM product_skus')) return { rows: [{ id: 1, product_id: 11 }] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };

  logisticsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders');
  const res = createJsonResponse();

  await route.handlers.at(-1)({
    body: {
      supplier_id: 5,
      items: [
        { sku_id: 1, quantity: 2, cost_price: 10 },
        { sku_id: 2, quantity: 1, cost_price: 20 }
      ]
    },
    user: { id: 9 }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '包含不存在的 sku_id' });
  assert.ok(queries.includes('BEGIN'));
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('purchase order receive rolls back before returning 404 for missing po', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    query: async (sql) => {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT id, po_number FROM purchase_orders')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };

  logisticsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/purchase-orders/:id/receive');
  const res = createJsonResponse();

  await route.handlers.at(-1)({
    params: { id: '7' },
    body: { lines: [{ sku_id: 3, quantity: 1 }] }
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: '採購單不存在' });
  assert.ok(queries.includes('BEGIN'));
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('bulk sku import rolls back before returning 500 when no warehouse is configured', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    query: async (sql) => {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM inventory_warehouses')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    query: async (sql) => {
      const text = String(sql);
      queries.push(text);
      if (text.includes('FROM product_skus')) return { rows: [{ id: 1, stock: 5, cost_price: 10 }] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    connect: async () => client,
  };
  const upload = { single: () => (req, res, next) => next() };

  adminRoutes(app, pool, () => {}, upload);
  const route = findRoute(app.routes, 'POST', '/api/admin/bulk-skus/import');
  const res = createJsonResponse();

  await route.handlers.at(-1)({
    query: {},
    body: {},
    file: {
      buffer: Buffer.from('sku_id,barcode,cost_price,price,is_active,target_stock,note\n1,,,,,9,restock\n', 'utf8')
    },
    user: { id: 12 }
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: '未設定倉庫' });
  assert.ok(queries.includes('BEGIN'));
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});
