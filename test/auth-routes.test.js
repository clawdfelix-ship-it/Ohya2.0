const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authRoutes = require('../routes/auth');

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

function count(routes, method, routePath) {
  return routes.filter((route) => route.method === method && route.path === routePath).length;
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

test('auth routes register storefront and api POST handlers', () => {
  const app = createRouteCapturingApp();
  const fakePool = { query: async () => ({ rows: [] }) };
  const noop = () => {};
  const fakeBcrypt = { hash: async () => 'hashed', compare: async () => true };

  authRoutes(app, fakePool, noop, noop, fakeBcrypt);

  assert.equal(count(app.routes, 'POST', '/register'), 1);
  assert.equal(count(app.routes, 'POST', '/login'), 1);
  assert.equal(count(app.routes, 'POST', '/api/auth/register'), 1);
  assert.equal(count(app.routes, 'POST', '/api/auth/login'), 1);
});

test('registerUser stores normalized email and falls back contact to email', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT id FROM users WHERE username = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM users WHERE LOWER(email) = LOWER($1)')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [{
            id: 7,
            username: params[0],
            email: params[1],
            contact: params[2],
            is_admin: false,
          }]
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const bcrypt = {
    hash: async (password, rounds) => {
      assert.equal(password, 'secret123');
      assert.equal(rounds, 10);
      return 'hashed-password';
    }
  };

  const result = await authRoutes.registerUser(pool, bcrypt, {
    username: '  alice  ',
    email: '  Alice@Example.com  ',
    password: 'secret123',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.user, {
    id: 7,
    username: 'alice',
    email: 'alice@example.com',
    contact: 'alice@example.com',
    is_admin: false,
  });
  assert.deepEqual(queries[2].params, ['alice', 'alice@example.com', 'alice@example.com', 'hashed-password']);
});

test('registerUser rejects duplicate email addresses', async () => {
  const pool = {
    query: async (sql) => {
      if (sql.includes('SELECT id FROM users WHERE username = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM users WHERE LOWER(email) = LOWER($1)')) {
        return { rows: [{ id: 9 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const bcrypt = { hash: async () => 'hashed-password' };

  const result = await authRoutes.registerUser(pool, bcrypt, {
    username: 'alice',
    email: 'alice@example.com',
    password: 'secret123',
  });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: '電郵地址已被使用',
  });
});

test('loginUser accepts email as identifier', async () => {
  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /WHERE username = \$1 OR LOWER\(email\) = LOWER\(\$1\)/);
      assert.deepEqual(params, ['alice@example.com']);
      return {
        rows: [{
          id: 3,
          username: 'alice',
          email: 'alice@example.com',
          password_hash: 'stored-hash',
          is_admin: false,
          contact: 'alice@example.com',
        }]
      };
    }
  };
  const bcrypt = {
    compare: async (password, hash) => {
      assert.equal(password, 'secret123');
      assert.equal(hash, 'stored-hash');
      return true;
    }
  };

  const result = await authRoutes.loginUser(pool, bcrypt, {
    email: ' alice@example.com ',
    password: 'secret123',
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.username, 'alice');
  assert.equal(result.user.email, 'alice@example.com');
});

test('storefront auth forms include csrf hidden fields', () => {
  const loginView = fs.readFileSync(path.join(__dirname, '..', 'views', 'login.ejs'), 'utf8');
  const registerView = fs.readFileSync(path.join(__dirname, '..', 'views', 'register.ejs'), 'utf8');

  assert.match(loginView, /name="_csrf" value="<%= csrfToken \|\| '' %>"/);
  assert.match(registerView, /name="_csrf" value="<%= csrfToken \|\| '' %>"/);
});

test('storefront login regenerates session and clears stale backoffice flags', async () => {
  const app = createRouteCapturingApp();
  const fakePool = {
    query: async () => ({
      rows: [{
        id: 3,
        username: 'alice',
        email: 'alice@example.com',
        password_hash: 'stored-hash',
        is_admin: false,
        contact: 'alice@example.com',
      }]
    })
  };
  const fakeBcrypt = { compare: async () => true };

  authRoutes(app, fakePool, () => {}, () => {}, fakeBcrypt);
  const route = findRoute(app.routes, 'POST', '/login');
  let regenerateCalled = false;
  const req = {
    body: { email: 'alice@example.com', password: 'secret123' },
    session: {
      isBackoffice: true,
      adminPermissions: ['orders:write'],
      regenerate(cb) {
        regenerateCalled = true;
        delete this.isBackoffice;
        delete this.adminPermissions;
        cb(null);
      }
    }
  };
  let redirected = null;
  const res = {
    json() {
      throw new Error('Unexpected JSON response');
    },
    redirect(url) {
      redirected = url;
    },
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    },
    render() {
      throw new Error('Unexpected render');
    }
  };

  await route.handlers[0](req, res);

  assert.equal(regenerateCalled, true);
  assert.equal(redirected, '/');
  assert.equal(req.session.userId, 3);
  assert.equal(req.session.username, 'alice');
  assert.equal(req.session.isAdmin, false);
  assert.equal(req.session.isBackoffice, false);
  assert.equal('adminPermissions' in req.session, false);
});
