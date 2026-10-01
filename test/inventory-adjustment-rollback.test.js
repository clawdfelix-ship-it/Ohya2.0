const test = require('node:test');
const assert = require('node:assert/strict');

const registerProductsRoutes = require('../routes/products-full');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    patch: record('PATCH'),
    delete: record('DELETE'),
  };
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

test('inventory adjust rolls back before returning when the SKU does not exist', async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT id FROM inventory_warehouses WHERE is_active = true')) {
        return { rows: [{ id: 1 }] };
      }
      if (normalized.startsWith('INSERT INTO inventory_levels')) {
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT ps.id, ps.product_id')) {
        return { rows: [] };
      }
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

  registerProductsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/admin/inventory/adjust');
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
      body: { sku_id: 999, delta: 1 }
    },
    res
  );

  assert.equal(statusCode, 404);
  assert.deepEqual(payload, { error: 'SKU 不存在' });
  assert.equal(released, true);
  const beginIndex = calls.findIndex((entry) => entry.sql === 'BEGIN');
  const rollbackIndex = calls.findIndex((entry) => entry.sql === 'ROLLBACK');
  assert.ok(beginIndex >= 0, 'expected transaction begin');
  assert.ok(rollbackIndex > beginIndex, 'expected rollback after begin');
});
