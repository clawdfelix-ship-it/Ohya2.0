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
    delete: record('DELETE'),
  };
}

test('order-edit shipped-map excludes cancelled fulfillments from SQL aggregation', async () => {
  const app = createRouteCapturingApp();
  let capturedSql = null;
  const pool = {
    async query(sql) {
      capturedSql = String(sql).replace(/\s+/g, ' ').trim();
      return { rows: [{ item_id: 101, q: 0 }] };
    }
  };

  require('../routes/admin-order-edit')(app, pool);
  const route = app.routes.find((entry) => entry.method === 'GET' && entry.path === '/api/admin/order-edit/shipped-map');
  assert.ok(route, 'expected shipped-map route to be registered');

  const req = {
    query: { order_id: '55' },
    session: { userId: 3, isBackoffice: true, adminPermissions: ['orders:read'] },
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

  await route.handlers[0](req, res, async () => {
    await route.handlers[1](req, res);
  });

  assert.equal(statusCode, 200);
  assert.deepEqual(payload, { map: { 101: 0 } });
  assert.match(capturedSql, /SUM\(CASE WHEN f\.state<>'cancelled' THEN offi\.quantity ELSE 0 END\)/);
});
