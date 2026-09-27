const test = require('node:test');
const assert = require('node:assert/strict');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => {
    routes.push({ method, path, handlers });
  };
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
  };
}

function findRoute(app, method, path) {
  const route = app.routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(route, `missing route ${method} ${path}`);
  return route;
}

function createJsonRes() {
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

test('admin brands create requires catalog:write permission', () => {
  const app = createRouteCapturingApp();
  const pool = {
    query: async () => {
      throw new Error('handler should not run without permission');
    }
  };

  require('../routes/brands')(app, pool);

  const route = findRoute(app, 'POST', '/api/admin/brands');
  assert.equal(route.handlers.length, 2);

  const req = {
    session: {
      userId: 9,
      isAdmin: false,
      isBackoffice: true,
      adminPermissions: ['reports:read'],
    },
    body: { name: 'Blocked Brand', slug: 'blocked-brand' }
  };
  const res = createJsonRes();
  let nextCalled = false;

  route.handlers[0](req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: '沒有權限' });
});

test('admin brands list requires catalog:read permission', () => {
  const app = createRouteCapturingApp();
  const pool = {
    query: async () => {
      throw new Error('handler should not run without permission');
    }
  };

  require('../routes/brands')(app, pool);

  const route = findRoute(app, 'GET', '/api/admin/brands');
  assert.equal(route.handlers.length, 2);

  const req = {
    session: {
      userId: 9,
      isAdmin: false,
      isBackoffice: true,
      adminPermissions: ['reports:read'],
    }
  };
  const res = createJsonRes();
  let nextCalled = false;

  route.handlers[0](req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: '沒有權限' });
});
