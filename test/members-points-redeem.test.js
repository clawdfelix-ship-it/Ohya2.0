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

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

test('members: redeem points uses atomic guarded update and returns remaining balance', async () => {
  const members = require('../routes/members');
  const app = createRouteCapturingApp();
  const calls = [];
  let balance = 100;
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'COMMIT') return { rows: [] };
      if (normalized === 'ROLLBACK') throw new Error('ROLLBACK should not run on success');
      if (normalized.startsWith('UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points')) {
        balance -= params[0];
        return { rows: [{ points: balance }] };
      }
      if (normalized.startsWith('INSERT INTO points_transactions')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  members(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/user/points/redeem');
  const req = { body: { points: 30, order_id: 91 }, user: { id: 7 } };
  let payload = null;
  const res = {
    status(code) {
      throw new Error(`Unexpected status ${code}`);
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  await route.handlers[1](req, res);

  assert.deepEqual(payload, { success: true, remaining_points: 70 });
  assert.match(calls[1].sql, /WHERE id = \$2 AND points >= \$1 RETURNING points/);
  assert.deepEqual(calls[1].params, [30, 7]);
});

test('members: redeem points rejects insufficient balance after atomic check', async () => {
  const members = require('../routes/members');
  const app = createRouteCapturingApp();
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN' || normalized === 'ROLLBACK') return { rows: [] };
      if (normalized.startsWith('UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points')) {
        return { rows: [] };
      }
      if (normalized === 'COMMIT') throw new Error('COMMIT should not run when balance check fails');
      if (normalized.startsWith('INSERT INTO points_transactions')) {
        throw new Error('transaction log should not be inserted when balance check fails');
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  members(app, pool);
  const route = findRoute(app.routes, 'POST', '/api/user/points/redeem');
  const req = { body: { points: 30, order_id: 91 }, user: { id: 7 } };
  let statusCode = null;
  let payload = null;
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

  await route.handlers[1](req, res);

  assert.equal(statusCode, 400);
  assert.deepEqual(payload, { error: '積分不足' });
  assert.ok(calls.some((entry) => entry.sql === 'ROLLBACK'));
});
