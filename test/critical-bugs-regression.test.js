const test = require('node:test');
const assert = require('node:assert/strict');

const adminRoutes = require('../routes/admin');
const logisticsRoutes = require('../routes/logistics');
const ordersRoutes = require('../routes/orders');
const productsRoutes = require('../routes/products-full');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => {
    routes.push({ method, path: routePath, handlers });
  };
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
    use: () => {},
  };
}

function findHandler(app, method, routePath) {
  const route = app.routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `missing route ${method} ${routePath}`);
  return route.handlers[route.handlers.length - 1];
}

function createJsonResponse() {
  const out = { statusCode: 200, body: undefined };
  return {
    out,
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(payload) {
      out.body = payload;
      return this;
    }
  };
}

test('purchase order creation rolls back before returning missing-sku errors', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM product_skus')) {
        return { rows: [{ id: 1, product_id: 10 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };
  logisticsRoutes(app, pool);
  const handler = findHandler(app, 'POST', '/api/admin/purchase-orders');
  const res = createJsonResponse();

  await handler({
    body: {
      supplier_id: 2,
      items: [
        { sku_id: 1, quantity: 1, cost_price: 10 },
        { sku_id: 2, quantity: 1, cost_price: 10 }
      ]
    },
    user: { id: 99 }
  }, res);

  assert.equal(res.out.statusCode, 400);
  assert.deepEqual(res.out.body, { error: '包含不存在的 sku_id' });
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('inventory adjust rolls back before returning invalid warehouse errors', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM inventory_warehouses WHERE id = $1')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };
  productsRoutes(app, pool);
  const handler = findHandler(app, 'POST', '/api/admin/inventory/adjust');
  const res = createJsonResponse();

  await handler({
    body: { sku_id: 5, delta: 3, warehouse_id: 999 }
  }, res);

  assert.equal(res.out.statusCode, 400);
  assert.deepEqual(res.out.body, { error: '倉庫不存在或已停用' });
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('bulk sku import rolls back before returning missing-warehouse errors', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM inventory_warehouses')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    query: async (sql) => {
      if (sql.includes('FROM product_skus')) {
        return { rows: [{ id: 1, stock: 1, cost_price: 10 }] };
      }
      throw new Error(`Unexpected pool SQL: ${sql}`);
    },
    connect: async () => client,
  };
  const upload = { single: () => (req, _res, next) => next() };
  adminRoutes(app, pool, () => {}, upload);
  const handler = findHandler(app, 'POST', '/api/admin/bulk-skus/import');
  const res = createJsonResponse();

  await handler({
    query: {},
    body: {},
    file: {
      buffer: Buffer.from('sku_id,barcode,cost_price,price,is_active,target_stock,note\n1,,,,,5,\n', 'utf8')
    },
    user: { id: 1 }
  }, res);

  assert.equal(res.out.statusCode, 500);
  assert.deepEqual(res.out.body, { error: '未設定倉庫' });
  assert.ok(queries.includes('ROLLBACK'));
  assert.equal(released, true);
});

test('order cancellation locks the order row before restoring stock', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT id, status FROM orders')) return { rows: [{ id: 8, status: 'pending' }] };
      if (sql.includes('SELECT * FROM order_items')) return { rows: [{ quantity: 2, product_id: 11 }] };
      if (sql.includes('UPDATE products SET stock = stock +')) return { rows: [] };
      if (sql.includes('UPDATE orders SET status = $1')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };
  ordersRoutes(app, pool, (_req, _res, next) => next(), () => {});
  const handler = findHandler(app, 'POST', '/api/orders/:id/cancel');
  const res = createJsonResponse();

  await handler({
    session: { userId: 3 },
    params: { id: '8' }
  }, res);

  assert.equal(res.out.statusCode, 200);
  assert.deepEqual(res.out.body, { success: true });
  assert.ok(queries.some((sql) => /FOR UPDATE/.test(sql)));
  assert.equal(released, true);
});

test('fps webhook does not stamp paid_at on failed callbacks and uses fps transaction code', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };
  logisticsRoutes(app, pool);
  const handler = findHandler(app, 'POST', '/webhooks/fps-payme');
  const res = createJsonResponse();

  await handler({
    body: {
      transaction_id: 'tx-1',
      order_id: 5,
      amount: 99,
      status: 'failed'
    }
  }, res);

  assert.equal(res.out.statusCode, 200);
  assert.deepEqual(res.out.body, { success: true });
  assert.match(calls[0].sql, /payment_status = 'failed'/);
  assert.doesNotMatch(calls[0].sql, /paid_at/i);
  assert.equal(calls[1].params[1], 'fps');
});
