const test = require('node:test');
const assert = require('node:assert/strict');

const { getCanonicalHostRedirect } = require('../utils/canonicalHost');

function makeReq({ method = 'GET', host = 'ohyagroups.net', forwardedHost, path = '/', originalUrl } = {}) {
  return {
    method,
    path,
    originalUrl: originalUrl || path,
    get(name) {
      const key = String(name || '').toLowerCase();
      if (key === 'x-forwarded-host') return forwardedHost;
      if (key === 'host') return host;
      return undefined;
    }
  };
}

test('redirects apex storefront GET requests and preserves path/query', () => {
  const req = makeReq({
    method: 'GET',
    path: '/products',
    originalUrl: '/products?category=glass&page=2'
  });

  assert.equal(
    getCanonicalHostRedirect(req),
    'https://www.ohyagroups.net/products?category=glass&page=2'
  );
});

test('does not redirect non-GET storefront submissions on apex', () => {
  const req = makeReq({
    method: 'POST',
    path: '/login',
    originalUrl: '/login'
  });

  assert.equal(getCanonicalHostRedirect(req), null);
});

test('does not redirect apex api or webhook endpoints', () => {
  assert.equal(
    getCanonicalHostRedirect(makeReq({
      method: 'GET',
      path: '/api/internal/jobs/email-outbox',
      originalUrl: '/api/internal/jobs/email-outbox'
    })),
    null
  );

  assert.equal(
    getCanonicalHostRedirect(makeReq({
      method: 'POST',
      path: '/webhooks/shipany',
      originalUrl: '/webhooks/shipany'
    })),
    null
  );
});

test('uses forwarded host when present and leaves other hosts untouched', () => {
  assert.equal(
    getCanonicalHostRedirect(makeReq({
      method: 'GET',
      host: 'preview.vercel.app',
      forwardedHost: 'ohyagroups.net',
      path: '/account',
      originalUrl: '/account'
    })),
    'https://www.ohyagroups.net/account'
  );

  assert.equal(
    getCanonicalHostRedirect(makeReq({
      method: 'GET',
      host: 'www.ohyagroups.net',
      path: '/account',
      originalUrl: '/account'
    })),
    null
  );
});
