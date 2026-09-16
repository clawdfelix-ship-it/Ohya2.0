const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const posts = new Map();
  return {
    post(path, ...handlers) {
      posts.set(path, handlers);
    },
    get() {},
    put() {},
    delete() {},
    use() {},
    posts,
  };
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
  };
}

async function runHandlers(handlers, req, res) {
  let index = 0;
  const next = async () => {
    const handler = handlers[index++];
    if (!handler) return;
    await handler(req, res, next);
  };
  await next();
}

test('order creation rolls back when locked stock is no longer sufficient', async () => {
  const app = createApp();
  const txCalls = [];
  const client = {
    async query(sql) {
      txCalls.push(String(sql).trim());
      if (/^BEGIN$/.test(sql)) return { rows: [] };
      if (/SELECT id, price, stock, name[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 1, price: 88, stock: 0, name: '測試商品' }] };
      }
      if (/^ROLLBACK$/.test(sql)) return { rows: [] };
      throw new Error(`unexpected client query: ${sql}`);
    },
    release() {},
  };

  const pool = {
    async query(sql) {
      if (/SELECT ci\.\*, p\.price, p\.stock, p\.name/.test(sql)) {
        return {
          rows: [{ product_id: 1, quantity: 1, price: 88, stock: 1, name: '測試商品' }],
        };
      }
      throw new Error(`unexpected pool query: ${sql}`);
    },
    async connect() {
      return client;
    },
  };

  const requireAuth = (req, res, next) => next();
  require('../routes/orders')(app, pool, requireAuth, () => {});

  const handlers = app.posts.get('/api/orders');
  const req = {
    session: { userId: 42 },
    body: {
      contact_name: 'Tester',
      contact_phone: '12345678',
      contact_address: 'HK',
      note: '',
    },
  };
  const res = createJsonRes();

  await runHandlers(handlers, req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '產品 測試商品 庫存不足' });
  assert.ok(txCalls.includes('BEGIN'));
  assert.ok(txCalls.includes('ROLLBACK'));
  assert.ok(!txCalls.includes('COMMIT'));
});
