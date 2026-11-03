const test = require('node:test');
const assert = require('node:assert/strict');

const orderRoutes = require('../routes/orders');

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

test('user cannot cancel orders that are already paid', async () => {
  const app = createRouteCapturingApp();
  const pool = {
    async query(sql) {
      if (sql === 'SELECT * FROM orders WHERE id = $1 AND user_id = $2') {
        return {
          rows: [{
            id: 8,
            user_id: 3,
            status: 'paid',
            payment_status: 'paid',
          }]
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async connect() {
      throw new Error('cancelled paid orders should be rejected before opening a transaction');
    }
  };
  const requireAuth = (req, res, next) => next();
  const requireAdmin = () => {
    throw new Error('admin middleware should not run');
  };
  orderRoutes(app, pool, requireAuth, requireAdmin);

  const route = findRoute(app.routes, 'POST', '/api/orders/:id/cancel');
  const req = {
    params: { id: '8' },
    session: { userId: 3 },
  };
  const res = {
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

  await route.handlers[1](req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '此訂單無法取消' });
});
