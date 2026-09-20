const test = require('node:test');
const assert = require('node:assert/strict');

const registerMembersRoutes = require('../routes/members');

function createApp() {
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

function getRoute(app, method, routePath) {
  return app.routes.find((route) => route.method === method && route.path === routePath);
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
    },
  };
}

test('redeeming points rejects non-positive integers before touching the database', async () => {
  let connected = false;
  const pool = {
    connect: async () => {
      connected = true;
      throw new Error('should not connect');
    },
  };
  const app = createApp();
  registerMembersRoutes(app, pool);
  const route = getRoute(app, 'POST', '/api/user/points/redeem');
  const handler = route.handlers[route.handlers.length - 1];
  const res = createJsonResponse();

  await handler(
    {
      body: { points: -1000, order_id: 123 },
      user: { id: 7 },
    },
    res
  );

  assert.equal(connected, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '積分必須為正整數' });
});
