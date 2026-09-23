const test = require('node:test');
const assert = require('node:assert/strict');

const cartRoutes = require('../routes/cart');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
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

test('cart add coerces quantity to integer and uses atomic upsert', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalized, params });
      if (normalized === "SELECT id, name, price FROM products WHERE id = $1 AND status = 'active'") {
        return { rows: [{ id: 9, name: 'Tea Pot', price: 88 }] };
      }
      if (normalized.startsWith('INSERT INTO cart_items')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };

  cartRoutes(app, pool, () => {});
  const route = findRoute(app.routes, 'POST', '/api/cart/add');
  const handler = route.handlers[route.handlers.length - 1];

  const req = {
    session: { userId: 3 },
    body: { product_id: '9', quantity: '2' }
  };
  const res = createJsonResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].params, [9]);
  assert.match(queries[1].sql, /ON CONFLICT \(user_id, product_id\)/);
  assert.deepEqual(queries[1].params, [3, 9, 2]);
});

test('cart update rejects non-integer quantity instead of passing bad value to SQL', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalized, params });
      if (normalized === 'SELECT ci.* FROM cart_items ci WHERE ci.id = $1 AND ci.user_id = $2') {
        return { rows: [{ id: 15, user_id: 8, quantity: 1 }] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };

  cartRoutes(app, pool, () => {});
  const route = findRoute(app.routes, 'PUT', '/api/cart/:id');
  const handler = route.handlers[route.handlers.length - 1];

  const req = {
    session: { userId: 8 },
    params: { id: '15' },
    body: { quantity: 'abc' }
  };
  const res = createJsonResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '數量不正確' });
  assert.equal(queries.length, 1);
});
