const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const routes = [];
  return {
    routes,
    get(path, handler) {
      routes.push({ method: 'GET', path, handler });
    },
    post(path, handler) {
      routes.push({ method: 'POST', path, handler });
    },
  };
}

function findRoute(app, method, path) {
  const route = app.routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(route, `Missing route ${method} ${path}`);
  return route;
}

test('email outbox job rejects forged x-vercel-cron header without shared secret', async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-secret';

  const outboxWorkerPath = require.resolve('../utils/outboxWorker');
  const originalOutboxWorker = require.cache[outboxWorkerPath];
  require.cache[outboxWorkerPath] = {
    exports: {
      flushOutbox: async () => ({ processed: 0 }),
    },
  };

  delete require.cache[require.resolve('../routes/outbox-jobs')];
  const app = createApp();
  require('../routes/outbox-jobs')(app, {});
  const route = findRoute(app, 'POST', '/api/internal/jobs/email-outbox');

  const res = {
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

  try {
    await route.handler({
      query: {},
      get(name) {
        if (String(name).toLowerCase() === 'x-vercel-cron') return '1';
        return '';
      },
    }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
  } finally {
    if (originalOutboxWorker) require.cache[outboxWorkerPath] = originalOutboxWorker;
    else delete require.cache[outboxWorkerPath];
    delete require.cache[require.resolve('../routes/outbox-jobs')];
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
});

test('email outbox job accepts bearer shared secret', async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-secret';

  const outboxWorkerPath = require.resolve('../utils/outboxWorker');
  const originalOutboxWorker = require.cache[outboxWorkerPath];
  require.cache[outboxWorkerPath] = {
    exports: {
      flushOutbox: async (_pool, options) => ({
        processed: 2,
        options,
      }),
    },
  };

  delete require.cache[require.resolve('../routes/outbox-jobs')];
  const app = createApp();
  require('../routes/outbox-jobs')(app, {});
  const route = findRoute(app, 'GET', '/api/internal/jobs/email-outbox');

  const res = {
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

  try {
    await route.handler({
      query: { limit: '3', maxMs: '9000' },
      get(name) {
        if (String(name).toLowerCase() === 'authorization') return 'Bearer cron-secret';
        return '';
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.summary.processed, 2);
    assert.deepEqual(res.body.summary.options, { limit: 3, maxRuntimeMs: 9000 });
  } finally {
    if (originalOutboxWorker) require.cache[outboxWorkerPath] = originalOutboxWorker;
    else delete require.cache[outboxWorkerPath];
    delete require.cache[require.resolve('../routes/outbox-jobs')];
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
});
