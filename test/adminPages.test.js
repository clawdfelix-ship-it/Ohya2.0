const test = require('node:test');
const assert = require('node:assert/strict');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
  };
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

test('adminBootstrap: hasAdmin queries users.is_admin', async () => {
  const { hasAdmin } = require('../utils/adminBootstrap');
  const calls = [];
  const fakePool = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [{ exists: true }] };
    },
  };
  const out = await hasAdmin(fakePool);
  assert.equal(out, true);
  assert.match(calls[0], /FROM\s+users/i);
  assert.match(calls[0], /is_admin\s*=\s*true/i);
});

test('adminBootstrap: createFirstAdmin inserts admin user with bcrypt hash', async () => {
  const { createFirstAdmin } = require('../utils/adminBootstrap');
  const calls = [];
  const fakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/INSERT\s+INTO\s+users/i.test(sql)) {
        return { rows: [{ id: 9, username: params[0], is_admin: true }] };
      }
      return { rows: [] };
    },
  };
  const out = await createFirstAdmin(fakePool, { username: 'admin', password: 'admin123', contact: '' });
  assert.equal(out.id, 9);
  assert.equal(out.username, 'admin');
  assert.equal(out.is_admin, true);
  assert.match(String(calls[0].params[1]), /^\$2[aby]\$/);
});

test('adminPages: setupEnabled blocks when admin exists', async () => {
  const adminPages = require('../routes/adminPages');
  const prev = process.env.ADMIN_SETUP_TOKEN;
  process.env.ADMIN_SETUP_TOKEN = 'bootstrap-secret';
  try {
    const out = await adminPages.setupEnabled({ hasAdmin: async () => true });
    assert.equal(out, false);
  } finally {
    process.env.ADMIN_SETUP_TOKEN = prev;
  }
});

test('adminPages: setupEnabled requires deployment setup token', async () => {
  const adminPages = require('../routes/adminPages');
  const prev = process.env.ADMIN_SETUP_TOKEN;
  delete process.env.ADMIN_SETUP_TOKEN;
  try {
    const out = await adminPages.setupEnabled({ hasAdmin: async () => false });
    assert.equal(out, false);
  } finally {
    process.env.ADMIN_SETUP_TOKEN = prev;
  }
});

test('adminPages: isAdminSession requires admin or permissioned backoffice session', () => {
  const adminPages = require('../routes/adminPages');
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: true }), true);
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: false, isBackoffice: true, adminPermissions: ['orders:read'] }), true);
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: false, isBackoffice: true, adminPermissions: [] }), false);
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: false, isBackoffice: false }), false);
  assert.equal(adminPages.isAdminSession({}), false);
});

test('adminPages: requireAdminPage redirects to /admin/login when not admin', async () => {
  const adminPages = require('../routes/adminPages');
  const mw = adminPages.requireAdminPage();
  let redirected = null;
  const req = { session: {} };
  const res = { redirect: (u) => (redirected = u) };
  await mw(req, res, () => {});
  assert.equal(redirected, '/admin/login');
});

test('adminPages: setup page stays hidden without valid setup token', async () => {
  const adminPages = require('../routes/adminPages');
  const app = createRouteCapturingApp();
  const prev = process.env.ADMIN_SETUP_TOKEN;
  process.env.ADMIN_SETUP_TOKEN = 'bootstrap-secret';
  const pool = {
    query: async (sql) => {
      if (/SELECT EXISTS/.test(sql)) return { rows: [{ exists: false }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  try {
    adminPages(app, pool);
    const route = findRoute(app.routes, 'GET', '/admin/setup');
    let statusCode = null;
    let body = null;
    const req = { query: {} };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      send(payload) {
        body = payload;
        return this;
      },
      render() {
        throw new Error('Unexpected render');
      }
    };

    await route.handlers[0](req, res);

    assert.equal(statusCode, 404);
    assert.equal(body, 'Not Found');
  } finally {
    process.env.ADMIN_SETUP_TOKEN = prev;
  }
});

test('adminPages: setup POST rejects when deployment token is missing', async () => {
  const adminPages = require('../routes/adminPages');
  const app = createRouteCapturingApp();
  const prev = process.env.ADMIN_SETUP_TOKEN;
  process.env.ADMIN_SETUP_TOKEN = 'bootstrap-secret';
  let insertAttempted = false;
  const pool = {
    query: async (sql) => {
      if (/SELECT EXISTS/.test(sql)) return { rows: [{ exists: false }] };
      if (/INSERT INTO users/.test(sql)) {
        insertAttempted = true;
        return { rows: [{ id: 1, username: 'admin', is_admin: true }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  try {
    adminPages(app, pool);
    const route = findRoute(app.routes, 'POST', '/admin/setup');
    let statusCode = null;
    let body = null;
    const req = {
      body: { username: 'admin', password: 'secret123' },
      session: {
        regenerate() {
          throw new Error('Unexpected regenerate');
        }
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      send(payload) {
        body = payload;
        return this;
      },
      redirect() {
        throw new Error('Unexpected redirect');
      }
    };

    await route.handlers[0](req, res);

    assert.equal(statusCode, 404);
    assert.equal(body, 'Not Found');
    assert.equal(insertAttempted, false);
  } finally {
    process.env.ADMIN_SETUP_TOKEN = prev;
  }
});

test('adminPages: admin login does not persist backoffice session for users without permissions', async () => {
  const adminPages = require('../routes/adminPages');
  const bcrypt = require('bcryptjs');
  const app = createRouteCapturingApp();
  const pool = {
    query: async (sql) => {
      if (sql.includes('FROM users WHERE username = $1')) {
        return {
          rows: [{
            id: 12,
            username: 'staff',
            password_hash: bcrypt.hashSync('secret123', 4),
            is_admin: false,
            contact: 'staff@example.com',
          }]
        };
      }
      if (sql.includes('FROM admin_permissions')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  adminPages(app, pool);
  const route = findRoute(app.routes, 'POST', '/admin/login');
  const req = {
    body: { username: 'staff', password: 'secret123' },
    session: {
      regenerate() {
        throw new Error('regenerate should not run for rejected login');
      }
    }
  };
  let statusCode = null;
  let rendered = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    render(view, payload) {
      rendered = { view, payload };
      return this;
    },
    redirect() {
      throw new Error('Unexpected redirect');
    }
  };

  await route.handlers[0](req, res);

  assert.equal(statusCode, 403);
  assert.equal(rendered.view, 'admin/login');
  assert.equal(rendered.payload.error, '需要管理員權限');
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.isBackoffice, undefined);
  assert.equal(req.session.adminPermissions, undefined);
});

test('adminPages: admin login regenerates session after permissions are confirmed', async () => {
  const adminPages = require('../routes/adminPages');
  const bcrypt = require('bcryptjs');
  const app = createRouteCapturingApp();
  const pool = {
    query: async (sql) => {
      if (sql.includes('FROM users WHERE username = $1')) {
        return {
          rows: [{
            id: 5,
            username: 'ops',
            password_hash: bcrypt.hashSync('secret123', 4),
            is_admin: false,
            contact: 'ops@example.com',
          }]
        };
      }
      if (sql.includes('FROM admin_permissions')) {
        return { rows: [{ permissions: ['orders:read'] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  adminPages(app, pool);
  const route = findRoute(app.routes, 'POST', '/admin/login');
  let regenerateCalled = false;
  const req = {
    body: { username: 'ops', password: 'secret123' },
    session: {
      regenerate(cb) {
        regenerateCalled = true;
        cb(null);
      }
    }
  };
  let redirected = null;
  const res = {
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    },
    render() {
      throw new Error('Unexpected render');
    },
    redirect(url) {
      redirected = url;
    }
  };

  await route.handlers[0](req, res);

  assert.equal(regenerateCalled, true);
  assert.equal(redirected, '/admin');
  assert.equal(req.session.userId, 5);
  assert.equal(req.session.isBackoffice, true);
  assert.deepEqual(req.session.adminPermissions, ['orders:read']);
});
