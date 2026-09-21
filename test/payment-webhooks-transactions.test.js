const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

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
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('payment webhooks reject FPS callback when shared secret is not configured', async () => {
  const oldSecret = process.env.FPS_PAYME_WEBHOOK_SECRET;
  delete process.env.FPS_PAYME_WEBHOOK_SECRET;

  const app = createRouteCapturingApp();
  const pool = {
    query: async () => {
      throw new Error('pool.query should not be called without webhook secret');
    }
  };
  logisticsRoutes(app, pool);
  const route = findRoute(app.routes, 'POST', '/webhooks/fps-payme');
  const res = createJsonResponse();

  try {
    await route.handlers.at(-1)({
      headers: {},
      rawBody: Buffer.from('{"order_id":123,"status":"success"}', 'utf8'),
      body: { order_id: 123, transaction_id: 'fake', amount: 100, status: 'success' }
    }, res);
  } finally {
    if (oldSecret === undefined) delete process.env.FPS_PAYME_WEBHOOK_SECRET;
    else process.env.FPS_PAYME_WEBHOOK_SECRET = oldSecret;
  }

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, error: 'Webhook 未配置' });
});

test('payment webhooks write payment_transactions (upsert)', async () => {
  const app = createRouteCapturingApp();
  const queries = [];
  const pool = {
    query: async (sql) => {
      queries.push(String(sql));
      return { rows: [] };
    }
  };
  const oldSecret = process.env.FPS_PAYME_WEBHOOK_SECRET;
  process.env.FPS_PAYME_WEBHOOK_SECRET = 'fps-secret';

  const payload = { order_id: 123, transaction_id: 'txn-1', amount: 100, status: 'success' };
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', 'fps-secret').update(rawBody).digest('hex');

  try {
    logisticsRoutes(app, pool);
    const route = findRoute(app.routes, 'POST', '/webhooks/fps-payme');
    const res = createJsonResponse();
    await route.handlers.at(-1)({
      headers: { 'x-fps-payme-signature': signature },
      rawBody,
      body: payload
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
  } finally {
    if (oldSecret === undefined) delete process.env.FPS_PAYME_WEBHOOK_SECRET;
    else process.env.FPS_PAYME_WEBHOOK_SECRET = oldSecret;
  }

  assert.ok(queries.some((sql) => /INSERT\s+INTO\s+payment_transactions/i.test(sql)));
  assert.ok(queries.some((sql) => /ON\s+CONFLICT\s*\(\s*payment_method_code\s*,\s*transaction_id\s*\)/i.test(sql)));
  assert.ok(queries.some((sql) => /status = CASE WHEN \$1 = 'paid' AND status = 'pending' THEN 'paid' ELSE status END/i.test(sql)));
});
