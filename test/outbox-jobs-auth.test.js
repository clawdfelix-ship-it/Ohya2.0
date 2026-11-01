const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const routes = {};
  return {
    get(path, handler) {
      routes[`GET ${path}`] = handler;
    },
    post(path, handler) {
      routes[`POST ${path}`] = handler;
    },
    routes,
  };
}

function createReq(headers = {}) {
  return {
    query: {},
    get(name) {
      const key = String(name || '').toLowerCase();
      const entry = Object.entries(headers).find(([header]) => header.toLowerCase() === key);
      return entry ? entry[1] : undefined;
    },
  };
}

function createRes() {
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

function loadRegisterOutboxRoutes() {
  const routePath = require.resolve('../routes/outbox-jobs');
  const workerPath = require.resolve('../utils/outboxWorker');
  const previousWorker = require.cache[workerPath];
  const previousRoute = require.cache[routePath];

  require.cache[workerPath] = {
    id: workerPath,
    filename: workerPath,
    loaded: true,
    exports: {
      flushOutbox: async () => ({ ok: true }),
    },
  };
  delete require.cache[routePath];

  const registerOutboxRoutes = require('../routes/outbox-jobs');

  return {
    registerOutboxRoutes,
    restore() {
      delete require.cache[routePath];
      if (previousRoute) require.cache[routePath] = previousRoute;
      if (previousWorker) require.cache[workerPath] = previousWorker;
      else delete require.cache[workerPath];
    },
  };
}

test('email outbox internal endpoint rejects spoofed x-vercel-cron header without shared secret', async () => {
  const prevCron = process.env.CRON_SECRET;
  const prevSync = process.env.MZAKKA_SYNC_SECRET;
  let loader;
  process.env.CRON_SECRET = 'top-secret';
  delete process.env.MZAKKA_SYNC_SECRET;

  try {
    loader = loadRegisterOutboxRoutes();
    const app = createApp();
    loader.registerOutboxRoutes(app, {});

    const req = createReq({ 'x-vercel-cron': '1' });
    const res = createRes();
    await app.routes['GET /api/internal/jobs/email-outbox'](req, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
  } finally {
    if (loader) loader.restore();
    process.env.CRON_SECRET = prevCron;
    process.env.MZAKKA_SYNC_SECRET = prevSync;
  }
});

test('email outbox internal endpoint accepts shared secret headers', async () => {
  const prevCron = process.env.CRON_SECRET;
  const prevSync = process.env.MZAKKA_SYNC_SECRET;
  let loader;
  process.env.CRON_SECRET = 'top-secret';
  delete process.env.MZAKKA_SYNC_SECRET;

  try {
    loader = loadRegisterOutboxRoutes();
    const app = createApp();
    loader.registerOutboxRoutes(app, null);

    const req = createReq({ 'x-sync-secret': 'top-secret' });
    const res = createRes();
    await app.routes['POST /api/internal/jobs/email-outbox'](req, res);

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'DATABASE_URL not configured' });
  } finally {
    if (loader) loader.restore();
    process.env.CRON_SECRET = prevCron;
    process.env.MZAKKA_SYNC_SECRET = prevSync;
  }
});
