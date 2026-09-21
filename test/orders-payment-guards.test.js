const test = require('node:test');
const assert = require('node:assert/strict');

const ordersRoutes = require('../routes/orders');

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
    },
    render() {
      throw new Error('Unexpected render');
    },
    end() {
      return this;
    }
  };
}

test('user cancel route rejects orders that are already paid even if workflow status is still pending', async () => {
  const app = createRouteCapturingApp();
  const pool = {
    query: async (sql) => {
      assert.match(String(sql), /SELECT \* FROM orders WHERE id = \$1 AND user_id = \$2/);
      return { rows: [{ id: 7, status: 'pending', payment_status: 'paid' }] };
    },
    connect: async () => {
      throw new Error('connect should not be called for paid orders');
    }
  };

  ordersRoutes(app, pool, () => {}, () => {});
  const route = findRoute(app.routes, 'POST', '/api/orders/:id/cancel');
  const res = createJsonResponse();

  await route.handlers.at(-1)({
    params: { id: '7' },
    session: { userId: 3 }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '此訂單無法取消' });
});

test('proof approval also advances pending order workflow status to paid', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  let released = false;
  const client = {
    query: async (sql) => {
      const text = String(sql);
      queries.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('UPDATE payment_proofs SET status=')) return { rows: [{ id: 1 }] };
      if (text.includes('UPDATE orders')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {
      released = true;
    }
  };
  const pool = {
    connect: async () => client,
  };

  ordersRoutes(app, pool, () => {}, () => {});
  const route = findRoute(app.routes, 'POST', '/api/admin/orders/:id/proof/approve');
  const res = createJsonResponse();

  await route.handlers.at(-1)({
    params: { id: '12' },
    session: { userId: 9 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, payment_status: 'paid' });
  assert.equal(released, true);
  assert.ok(queries.some((sql) => /status=CASE WHEN status='pending' THEN 'paid' ELSE status END/i.test(sql)));
});
