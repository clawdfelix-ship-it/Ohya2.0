'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  DEFAULT_CANONICAL_BASE,
  createDomainRedirectMiddleware,
} = require('../utils/domainMigration');

const middleware = createDomainRedirectMiddleware();

function invoke({ host, forwardedHost, originalUrl = '/products?category=storefront-onahole&page=2', method = 'GET', path }) {
  return new Promise((resolve, reject) => {
    let nextCalled = false;
    const req = {
      method,
      originalUrl,
      path: path === undefined ? originalUrl.split('?')[0] : path,
      get(name) {
        if (name.toLowerCase() === 'host') return host;
        if (name.toLowerCase() === 'x-forwarded-host') return forwardedHost;
        return undefined;
      },
    };
    const res = {
      statusCode: null,
      locationValue: null,
      ended: false,
      status(code) { this.statusCode = code; return this; },
      location(value) { this.locationValue = value; return this; },
      end() {
        this.ended = true;
        resolve({ status: this.statusCode, location: this.locationValue, nextCalled });
      },
    };
    try {
      middleware(req, res, () => {
        nextCalled = true;
        resolve({ status: null, location: null, nextCalled });
      });
    } catch (error) { reject(error); }
  });
}

for (const host of ['ohyagroups.net', 'www.ohyagroups.net', 'ohyagroups.com']) {
  for (const variant of [host, host.toUpperCase(), `${host}:443`]) {
    test(`308 redirects ${variant} with exact path and query`, async () => {
      const result = await invoke({ host: variant, originalUrl: '/products?category=storefront-onahole&q=hello%20world&page=2' });
      assert.deepEqual(result, {
        status: 308,
        location: 'https://www.ohyagroups.com/products?category=storefront-onahole&q=hello%20world&page=2',
        nextCalled: false,
      });
    });
  }
}

test('forwarded host selects only the first exact hostname', async () => {
  const result = await invoke({ host: 'internal', forwardedHost: 'WWW.OHYAGROUPS.NET:443, proxy.internal', originalUrl: '/guide/example?utm_source=old' });
  assert.equal(result.status, 308);
  assert.equal(result.location, 'https://www.ohyagroups.com/guide/example?utm_source=old');
});

for (const host of ['www.ohyagroups.com', 'www.ohyagroups.com:443', 'ohya2-0.vercel.app', 'preview-abc.vercel.app', 'unknown.example', 'www.ohyagroups.net.evil.example', 'evilohyagroups.net', undefined]) {
  test(`does not redirect non-source host: ${host}`, async () => {
    const result = await invoke({ host });
    assert.deepEqual(result, { status: null, location: null, nextCalled: true });
  });
}

for (const originalUrl of ['/products\r\nX-Injected: yes', '/products?x=\r\nLocation:https://evil.example', '\r\n/products']) {
  test(`rejects a CR/LF originalUrl instead of constructing Location: ${JSON.stringify(originalUrl)}`, async () => {
    const result = await invoke({ host: 'www.ohyagroups.net', originalUrl });
    assert.deepEqual(result, { status: null, location: null, nextCalled: true });
  });
}

test('query containing an absolute URL cannot create an open redirect', async () => {
  const originalUrl = '/products?next=https://evil.example/steal';
  const result = await invoke({ host: 'ohyagroups.com', originalUrl });
  assert.equal(result.status, 308);
  assert.equal(result.location, `https://www.ohyagroups.com${originalUrl}`);
});

for (const path of ['/api/internal/jobs/daily-sync/refresh', '/webhooks/fps-payme']) {
  for (const method of ['GET', 'POST']) {
    for (const host of ['ohyagroups.net', 'www.ohyagroups.net', 'ohyagroups.com']) {
      test(`${method} ${path} on ${host} bypasses migration redirect`, async () => {
        const result = await invoke({ host, method, originalUrl: `${path}?migration_test=1`, path });
        assert.deepEqual(result, { status: null, location: null, nextCalled: true });
      });
    }
  }
}

test('the middleware emits no cookies or redirect body and works with HEAD', async () => {
  const app = require('express')();
  app.use(middleware);
  app.get('/public', (req, res) => res.status(200).end('ok'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/public?a=1`, {
      method: 'HEAD', redirect: 'manual', headers: { 'x-forwarded-host': 'www.ohyagroups.net' },
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://www.ohyagroups.com/public?a=1');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(await response.text(), '');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('canonical origin defaults to www.ohyagroups.com', () => {
  assert.equal(DEFAULT_CANONICAL_BASE, 'https://www.ohyagroups.com');
});
