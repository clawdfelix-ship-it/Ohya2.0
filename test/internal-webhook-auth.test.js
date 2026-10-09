const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
  };
}

function findRoute(routes, method, path) {
  const route = routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(route, `Missing route ${method} ${path}`);
  return route;
}

function createJsonResponse() {
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

test('outbox job rejects spoofed x-vercel-cron header without secret', async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalSyncSecret = process.env.MZAKKA_SYNC_SECRET;
  process.env.CRON_SECRET = 'cron-secret';
  delete process.env.MZAKKA_SYNC_SECRET;

  const outboxModulePath = require.resolve('../utils/outboxWorker');
  const originalOutboxModule = require.cache[outboxModulePath];
  require.cache[outboxModulePath] = {
    exports: {
      flushOutbox: async () => {
        throw new Error('flushOutbox should not run for unauthorized requests');
      },
    },
  };

  delete require.cache[require.resolve('../routes/outbox-jobs')];
  const app = createApp();
  require('../routes/outbox-jobs')(app, { fake: true });
  const route = findRoute(app.routes, 'GET', '/api/internal/jobs/email-outbox');
  const res = createJsonResponse();

  try {
    await route.handlers[0]({
      query: {},
      get(name) {
        if (String(name).toLowerCase() === 'x-vercel-cron') return '1';
        return '';
      },
    }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
  } finally {
    if (originalOutboxModule) require.cache[outboxModulePath] = originalOutboxModule;
    else delete require.cache[outboxModulePath];
    delete require.cache[require.resolve('../routes/outbox-jobs')];
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalSyncSecret === undefined) delete process.env.MZAKKA_SYNC_SECRET;
    else process.env.MZAKKA_SYNC_SECRET = originalSyncSecret;
  }
});

test('outbox job accepts bearer CRON_SECRET', async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalSyncSecret = process.env.MZAKKA_SYNC_SECRET;
  process.env.CRON_SECRET = 'cron-secret';
  delete process.env.MZAKKA_SYNC_SECRET;

  const outboxModulePath = require.resolve('../utils/outboxWorker');
  const originalOutboxModule = require.cache[outboxModulePath];
  let observedOptions = null;
  require.cache[outboxModulePath] = {
    exports: {
      flushOutbox: async (_pool, options) => {
        observedOptions = options;
        return { processed: 2 };
      },
    },
  };

  delete require.cache[require.resolve('../routes/outbox-jobs')];
  const app = createApp();
  require('../routes/outbox-jobs')(app, { fake: true });
  const route = findRoute(app.routes, 'GET', '/api/internal/jobs/email-outbox');
  const res = createJsonResponse();

  try {
    await route.handlers[0]({
      query: { limit: '7', maxMs: '1234' },
      get(name) {
        if (String(name).toLowerCase() === 'authorization') return 'Bearer cron-secret';
        return '';
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, summary: { processed: 2 } });
    assert.deepEqual(observedOptions, { limit: 7, maxRuntimeMs: 1234 });
  } finally {
    if (originalOutboxModule) require.cache[outboxModulePath] = originalOutboxModule;
    else delete require.cache[outboxModulePath];
    delete require.cache[require.resolve('../routes/outbox-jobs')];
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalSyncSecret === undefined) delete process.env.MZAKKA_SYNC_SECRET;
    else process.env.MZAKKA_SYNC_SECRET = originalSyncSecret;
  }
});

test('payment webhooks reject requests without configured or valid secrets', async () => {
  const originalFpsSecret = process.env.FPS_PAYME_WEBHOOK_SECRET;
  const originalAlipaySecret = process.env.ALIPAYHK_WEBHOOK_SECRET;
  const originalWechatSecret = process.env.WECHATPAY_WEBHOOK_SECRET;

  process.env.FPS_PAYME_WEBHOOK_SECRET = 'fps-secret';
  delete process.env.ALIPAYHK_WEBHOOK_SECRET;
  process.env.WECHATPAY_WEBHOOK_SECRET = 'wechat-secret';

  const app = createApp();
  const queries = [];
  require('../routes/logistics')(app, {
    query: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      return { rows: [] };
    },
  });

  const fpsRoute = findRoute(app.routes, 'POST', '/webhooks/fps-payme');
  const fpsRes = createJsonResponse();
  await fpsRoute.handlers[0]({
    body: { transaction_id: 't1', order_id: 9, amount: 100, status: 'success' },
    get() {
      return '';
    },
    headers: {},
  }, fpsRes);

  const alipayRoute = findRoute(app.routes, 'POST', '/webhooks/alipayhk');
  const alipayRes = createJsonResponse();
  await alipayRoute.handlers[0]({
    body: { out_trade_no: 'O1', trade_no: 'T1', trade_status: 'TRADE_SUCCESS' },
    get() {
      return '';
    },
    headers: {},
  }, alipayRes);

  const wechatRoute = findRoute(app.routes, 'POST', '/webhooks/wechatpay');
  const wechatRes = createJsonResponse();
  await wechatRoute.handlers[0]({
    body: { out_trade_no: 'O1', transaction_id: 'T1', trade_state: 'SUCCESS' },
    get(name) {
      if (String(name).toLowerCase() === 'authorization') return 'Bearer wrong-secret';
      return '';
    },
    headers: {},
  }, wechatRes);

  try {
    assert.equal(fpsRes.statusCode, 401);
    assert.deepEqual(fpsRes.body, { success: false, error: 'Invalid webhook secret' });
    assert.equal(alipayRes.statusCode, 503);
    assert.deepEqual(alipayRes.body, { success: false, error: 'ALIPAYHK_WEBHOOK_SECRET not configured' });
    assert.equal(wechatRes.statusCode, 401);
    assert.match(String(wechatRes.body), /UNAUTHORIZED/);
    assert.equal(queries.length, 0);
  } finally {
    if (originalFpsSecret === undefined) delete process.env.FPS_PAYME_WEBHOOK_SECRET;
    else process.env.FPS_PAYME_WEBHOOK_SECRET = originalFpsSecret;
    if (originalAlipaySecret === undefined) delete process.env.ALIPAYHK_WEBHOOK_SECRET;
    else process.env.ALIPAYHK_WEBHOOK_SECRET = originalAlipaySecret;
    if (originalWechatSecret === undefined) delete process.env.WECHATPAY_WEBHOOK_SECRET;
    else process.env.WECHATPAY_WEBHOOK_SECRET = originalWechatSecret;
  }
});
