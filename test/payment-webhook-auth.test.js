const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

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
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function sign(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

test('payment webhook rejects requests when secret is not configured', async () => {
  const originalSecret = process.env.FPS_PAYME_WEBHOOK_SECRET;
  const originalSharedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.FPS_PAYME_WEBHOOK_SECRET;
  delete process.env.PAYMENT_WEBHOOK_SECRET;

  const app = createApp();
  let queryCount = 0;
  const pool = { query: async () => { queryCount += 1; return { rows: [] }; } };
  require('../routes/logistics')(app, pool);

  const handler = app.posts.get('/webhooks/fps-payme')[0];
  const rawBody = Buffer.from(JSON.stringify({ transaction_id: 'tx-1', order_id: 123, status: 'success' }), 'utf8');
  const req = {
    body: JSON.parse(rawBody.toString('utf8')),
    rawBody,
    headers: { 'x-fps-signature': 'deadbeef' },
  };
  const res = createJsonRes();

  try {
    await handler(req, res);
  } finally {
    if (originalSecret === undefined) delete process.env.FPS_PAYME_WEBHOOK_SECRET;
    else process.env.FPS_PAYME_WEBHOOK_SECRET = originalSecret;
    if (originalSharedSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = originalSharedSecret;
  }

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, error: 'Webhook not configured' });
  assert.equal(queryCount, 0);
});

test('payment webhook rejects invalid signatures before mutating orders', async () => {
  const originalSecret = process.env.ALIPAYHK_WEBHOOK_SECRET;
  process.env.ALIPAYHK_WEBHOOK_SECRET = 'top-secret';

  const app = createApp();
  let queryCount = 0;
  const pool = { query: async () => { queryCount += 1; return { rows: [] }; } };
  require('../routes/logistics')(app, pool);

  const handler = app.posts.get('/webhooks/alipayhk')[0];
  const rawBody = Buffer.from(JSON.stringify({ out_trade_no: 'ORD-1', trade_no: 'ALI-1', trade_status: 'TRADE_SUCCESS' }), 'utf8');
  const req = {
    body: JSON.parse(rawBody.toString('utf8')),
    rawBody,
    headers: {
      'x-alipay-signature': sign('wrong-secret', rawBody),
    },
  };
  const res = createJsonRes();

  try {
    await handler(req, res);
  } finally {
    if (originalSecret === undefined) delete process.env.ALIPAYHK_WEBHOOK_SECRET;
    else process.env.ALIPAYHK_WEBHOOK_SECRET = originalSecret;
  }

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error: 'Invalid signature' });
  assert.equal(queryCount, 0);
});
