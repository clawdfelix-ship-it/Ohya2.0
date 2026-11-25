const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

function harness() {
  const app = express();
  const queries = [];
  app.use(express.json({
    verify(req, _res, buffer) { req.rawBody = buffer; },
  }));
  const pool = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } };
  require('../routes/logistics')(app, pool);
  return { app, queries };
}

async function post(app, path, body, signature) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  try {
    const payload = Buffer.from(JSON.stringify(body));
    const headers = { 'content-type': 'application/json' };
    if (signature !== undefined) headers['x-shipany-signature'] = signature;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers, body: payload,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('unverified payment webhooks reject every payload without database writes', async t => {
  const { app, queries } = harness();
  t.after(() => { delete process.env.SHIPANY_WEBHOOK_SECRET; });
  for (const path of ['/webhooks/fps-payme', '/webhooks/alipayhk', '/webhooks/wechatpay']) {
    const result = await post(app, path, { order_id: 42, status: 'success', trade_status: 'TRADE_SUCCESS', trade_state: 'SUCCESS' });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'PAYMENT_WEBHOOK_DISABLED');
    assert.equal(result.body.success, false);
  }
  assert.deepEqual(queries, []);
});

test('ShipAny requires configured secret and rejects a bad raw-body signature', async t => {
  const { app, queries } = harness();
  t.after(() => { delete process.env.SHIPANY_WEBHOOK_SECRET; });
  delete process.env.SHIPANY_WEBHOOK_SECRET;
  const body = { tracking_number: 'TN-42', status: 'delivered', updated_at: '2026-11-26T00:00:00Z' };
  let result = await post(app, '/webhooks/shipany', body);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'SHIPANY_WEBHOOK_NOT_CONFIGURED');
  process.env.SHIPANY_WEBHOOK_SECRET = 'test-webhook-secret';
  result = await post(app, '/webhooks/shipany', body, 'not-a-valid-signature');
  assert.equal(result.status, 403);
  assert.equal(result.body.success, false);
  assert.deepEqual(queries, []);
});

test('ShipAny accepts a valid raw-body HMAC before updating tracking', async t => {
  const { app, queries } = harness();
  process.env.SHIPANY_WEBHOOK_SECRET = 'test-webhook-secret';
  t.after(() => { delete process.env.SHIPANY_WEBHOOK_SECRET; });
  const body = { tracking_number: 'TN-42', status: 'delivered', updated_at: '2026-11-26T00:00:00Z' };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', process.env.SHIPANY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const result = await post(app, '/webhooks/shipany', body, signature);
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE orders/);
  assert.deepEqual(queries[0].params, ['delivered', '2026-11-26T00:00:00Z', 'TN-42']);
});
