const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const pointsService = require('../lib/pointsService');

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

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

function registerOrdersRoutes(app, pool, requireAuth, requireAdmin) {
  const originalLoad = Module._load;
  function fakeMulter() {
    return {
      single: () => (req, res, next) => {
        if (typeof next === 'function') next();
      },
    };
  }
  fakeMulter.memoryStorage = () => ({ mocked: true });

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'multer') return fakeMulter;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const ordersRoutes = require('../routes/orders');
    ordersRoutes(app, pool, requireAuth, requireAdmin);
  } finally {
    Module._load = originalLoad;
  }
}

function createPointsDb() {
  const state = {
    users: new Map([[7, { id: 7, points: 0 }]]),
    transactions: [
      { id: 1, user_id: 7, points: -120, type: 'redeem', order_id: 99, description: '結帳兌換即減 HK$1.20' },
    ],
    nextTxnId: 2,
  };

  const client = {
    async query(sql, params = []) {
      const s = normalizeSql(sql);

      if (s === "SELECT id, points FROM points_transactions WHERE order_id = $1 AND type = 'earn'") {
        return { rows: state.transactions.filter((t) => t.order_id === params[0] && t.type === 'earn') };
      }
      if (s === "SELECT id, points FROM points_transactions WHERE order_id = $1 AND type = 'redeem'") {
        return { rows: state.transactions.filter((t) => t.order_id === params[0] && t.type === 'redeem') };
      }
      if (s === 'SELECT id FROM points_transactions WHERE order_id = $1 AND type = $2 LIMIT 1') {
        return {
          rows: state.transactions
            .filter((t) => t.order_id === params[0] && t.type === params[1])
            .slice(0, 1)
            .map((t) => ({ id: t.id })),
        };
      }
      if (s.startsWith('INSERT INTO points_transactions')) {
        const txn = {
          id: state.nextTxnId++,
          user_id: params[0],
          points: params[1],
          type: params[2],
          description: params[3],
          order_id: params[4],
          expires_at: params[5],
        };
        state.transactions.push(txn);
        return { rows: [] };
      }
      if (s === 'UPDATE users SET points = GREATEST(0, points + $1), updated_at = NOW() WHERE id = $2') {
        const user = state.users.get(params[1]);
        user.points = Math.max(0, user.points + params[0]);
        return { rows: [] };
      }
      if (s === 'SELECT points FROM users WHERE id = $1 FOR UPDATE') {
        const user = state.users.get(params[0]);
        return { rows: user ? [{ points: user.points }] : [] };
      }

      throw new Error(`Unhandled SQL: ${s}`);
    },
  };

  return { client, state };
}

function createOrdersPool() {
  const state = {
    orders: new Map([[99, { id: 99, user_id: 7, status: 'paid', payment_status: 'paid' }]]),
    users: new Map([[7, { id: 7, points: 0 }]]),
    transactions: [
      { id: 1, user_id: 7, points: -100, type: 'redeem', order_id: 99, description: '結帳兌換即減 HK$1.00' },
    ],
    history: [],
    nextTxnId: 2,
  };

  const client = {
    async query(sql, params = []) {
      const s = normalizeSql(sql);
      const orderId = Number(params[0]);
      const userId = Number(params[1]);

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] };
      }
      if (s === 'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE') {
        const order = state.orders.get(orderId);
        if (!order || order.user_id !== userId) return { rows: [] };
        return { rows: [{ ...order }] };
      }
      if (s === 'SELECT id, status, payment_status FROM orders WHERE id=$1') {
        const order = state.orders.get(orderId);
        return { rows: order ? [{ id: order.id, status: order.status, payment_status: order.payment_status }] : [] };
      }
      if (s === 'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2') {
        const order = state.orders.get(Number(params[1]));
        order.status = params[0];
        return { rows: [] };
      }
      if (s.startsWith('INSERT INTO order_status_history')) {
        state.history.push({
          order_id: params[0],
          from_status: params[1],
          to_status: params[2],
          note: params[3],
          processed_by: params[4],
        });
        return { rows: [] };
      }
      if (s === "SELECT id, points FROM points_transactions WHERE order_id = $1 AND type = 'earn'") {
        return { rows: state.transactions.filter((t) => t.order_id === orderId && t.type === 'earn') };
      }
      if (s === "SELECT id, points FROM points_transactions WHERE order_id = $1 AND type = 'redeem'") {
        return { rows: state.transactions.filter((t) => t.order_id === orderId && t.type === 'redeem') };
      }
      if (s === 'SELECT id FROM points_transactions WHERE order_id = $1 AND type = $2 LIMIT 1') {
        return {
          rows: state.transactions
            .filter((t) => t.order_id === orderId && t.type === params[1])
            .slice(0, 1)
            .map((t) => ({ id: t.id })),
        };
      }
      if (s.startsWith('INSERT INTO points_transactions')) {
        state.transactions.push({
          id: state.nextTxnId++,
          user_id: params[0],
          points: params[1],
          type: params[2],
          description: params[3],
          order_id: params[4],
        });
        return { rows: [] };
      }
      if (s === 'UPDATE users SET points = GREATEST(0, points + $1), updated_at = NOW() WHERE id = $2') {
        const user = state.users.get(Number(params[1]));
        user.points = Math.max(0, user.points + params[0]);
        return { rows: [] };
      }
      if (s === 'SELECT points FROM users WHERE id = $1 FOR UPDATE') {
        const user = state.users.get(Number(params[0]));
        return { rows: user ? [{ points: user.points }] : [] };
      }

      throw new Error(`Unhandled SQL: ${s}`);
    },
    release() {},
  };

  return {
    state,
    query: async () => ({ rows: [] }),
    connect: async () => client,
  };
}

test('revokeOrderPoints restores redeemed points and stays idempotent', async () => {
  const { client, state } = createPointsDb();
  const order = { id: 99, user_id: 7, order_number: 'OHYA-TEST-99' };

  const first = await pointsService.revokeOrderPoints(client, order);
  assert.equal(first.restored, 120);
  assert.equal(first.applied, true);
  assert.equal(state.users.get(7).points, 120);

  const second = await pointsService.revokeOrderPoints(client, order);
  assert.equal(second.alreadyApplied, true);
  assert.equal(state.users.get(7).points, 120);

  const refundTxns = state.transactions.filter((t) => t.type === 'redeem_refund' && t.order_id === 99);
  assert.equal(refundTxns.length, 1);
  assert.equal(refundTxns[0].points, 120);
});

test('user cancel route refunds redeemed points when cancelling an order', async () => {
  const app = createRouteCapturingApp();
  const pool = createOrdersPool();
  const noop = () => {};

  registerOrdersRoutes(app, pool, noop, noop);

  const route = findRoute(app.routes, 'POST', '/api/orders/:id/cancel');
  const req = {
    session: { userId: 7 },
    params: { id: '99' },
  };
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  await route.handlers[1](req, res);

  assert.equal(statusCode, 200);
  assert.deepEqual(body, { success: true });
  assert.equal(pool.state.orders.get(99).status, 'cancelled');
  assert.equal(pool.state.users.get(7).points, 100);
  assert.equal(pool.state.history.length, 1);
  assert.equal(pool.state.history[0].to_status, 'cancelled');

  const refundTxns = pool.state.transactions.filter((t) => t.type === 'redeem_refund' && t.order_id === 99);
  assert.equal(refundTxns.length, 1);
  assert.equal(refundTxns[0].points, 100);
});
