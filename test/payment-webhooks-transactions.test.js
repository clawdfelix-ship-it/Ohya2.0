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
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('fps webhook rejects invalid signatures before touching the database', async () => {
  const app = createRouteCapturingApp();
  let queryCount = 0;
  logisticsRoutes(app, {
    async query() {
      queryCount += 1;
      throw new Error('should not reach database');
    }
  });

  const route = findRoute(app.routes, 'POST', '/webhooks/fps-payme');
  const req = {
    body: { transaction_id: 'tx-1', order_id: 9, amount: 88, status: 'success' },
    rawBody: Buffer.from('{"transaction_id":"tx-1"}', 'utf8'),
    headers: {
      'x-fps-payme-signature': 'deadbeef',
    }
  };
  const res = createJsonRes();
  const prevSecret = process.env.FPS_PAYME_WEBHOOK_SECRET;
  process.env.FPS_PAYME_WEBHOOK_SECRET = 'fps-secret';

  try {
    await route.handlers[0](req, res);
  } finally {
    process.env.FPS_PAYME_WEBHOOK_SECRET = prevSecret;
  }

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error: 'Invalid signature' });
  assert.equal(queryCount, 0);
});

test('alipay webhook marks pending orders as paid after signature verification', async () => {
  const app = createRouteCapturingApp();
  const state = {
    order: {
      id: 5,
      order_number: 'ORD-5',
      status: 'pending',
      payment_status: 'pending',
      total_amount: 123.45,
      payment_transaction_id: null,
    },
    transactions: [],
    histories: [],
  };
  const pool = {
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('UPDATE orders SET payment_status = \'paid\'')) {
        if (params[1] !== state.order.order_number) return { rows: [] };
        state.order.payment_status = 'paid';
        state.order.payment_transaction_id = params[0];
        if (state.order.status === 'pending') state.order.status = 'paid';
        return { rows: [{ id: state.order.id, total_amount: state.order.total_amount }] };
      }
      if (s.startsWith('INSERT INTO payment_transactions')) {
        state.transactions.push({
          order_id: params[0],
          payment_method_code: params[1],
          transaction_id: params[2],
          amount: params[3],
          status: params[4],
        });
        return { rows: [] };
      }
      if (s.startsWith('INSERT INTO order_status_history')) {
        state.histories.push({
          order_id: params[0],
          from_status: params[1],
          to_status: params[2],
          note: params[3],
          processed_by: params[4],
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${s}`);
    }
  };
  logisticsRoutes(app, pool);

  const route = findRoute(app.routes, 'POST', '/webhooks/alipayhk');
  const body = {
    out_trade_no: 'ORD-5',
    trade_no: 'ALI-123',
    trade_status: 'TRADE_SUCCESS',
  };
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  const sig = crypto.createHmac('sha256', 'alipay-secret').update(rawBody).digest('hex');
  const req = {
    body,
    rawBody,
    headers: {
      'x-alipayhk-signature': sig,
    }
  };
  const res = createJsonRes();
  const prevSecret = process.env.ALIPAYHK_WEBHOOK_SECRET;
  process.env.ALIPAYHK_WEBHOOK_SECRET = 'alipay-secret';

  try {
    await route.handlers[0](req, res);
  } finally {
    process.env.ALIPAYHK_WEBHOOK_SECRET = prevSecret;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(state.order.payment_status, 'paid');
  assert.equal(state.order.status, 'paid');
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].payment_method_code, 'alipayhk');
  assert.equal(state.histories.length, 1);
  assert.equal(state.histories[0].to_status, 'paid');
});
