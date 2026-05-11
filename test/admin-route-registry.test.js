const test = require('node:test');
const assert = require('node:assert/strict');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (path) => routes.push({ method, path });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
    use: () => {},
  };
}

function count(routes, method, path) {
  return routes.filter((r) => r.method === method && r.path === path).length;
}

test('admin routes: /api/admin/users must only be registered by members.js', async () => {
  const app = createRouteCapturingApp();

  const authRoutes = require('../routes/auth');
  const adminRoutes = require('../routes/admin');
  const membersRoutes = require('../routes/members');

  const fakePool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  };
  const noop = () => {};
  const fakeBcrypt = { hash: async () => '$2a$10$fake', compare: async () => true };
  const fakeUpload = { single: () => (req, res, next) => next() };

  authRoutes(app, fakePool, noop, noop, fakeBcrypt);
  adminRoutes(app, fakePool, noop, fakeUpload);
  membersRoutes(app, fakePool);

  assert.equal(count(app.routes, 'GET', '/api/admin/users'), 1);
  assert.equal(count(app.routes, 'POST', '/api/admin/users'), 1);
  assert.equal(count(app.routes, 'PUT', '/api/admin/users/:id'), 1);
  assert.equal(count(app.routes, 'POST', '/api/admin/users/:id/password'), 1);
});

test('admin routes: products low-stock/export must only be registered once', async () => {
  const app = createRouteCapturingApp();
  const productsFullRoutes = require('../routes/products-full');
  const adminRoutes = require('../routes/admin');

  const fakePool = { query: async () => ({ rows: [] }) };
  const noop = () => {};
  const fakeUpload = { single: () => (req, res, next) => next() };

  adminRoutes(app, fakePool, noop, fakeUpload);
  productsFullRoutes(app, fakePool);

  assert.equal(count(app.routes, 'GET', '/api/admin/products/low-stock'), 1);
  assert.equal(count(app.routes, 'GET', '/api/admin/products/export/csv'), 1);
});

