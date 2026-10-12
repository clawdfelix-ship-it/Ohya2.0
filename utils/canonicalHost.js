function readHeader(req, name) {
  if (!req) return '';
  if (typeof req.get === 'function') return req.get(name);
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
}

function normalizeHost(value) {
  return String(value || '').split(',')[0].trim().toLowerCase();
}

function isInternalEndpoint(pathname) {
  return pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/webhooks' ||
    pathname.startsWith('/webhooks/');
}

function getCanonicalHostRedirect(req) {
  const host = normalizeHost(readHeader(req, 'x-forwarded-host') || readHeader(req, 'host'));
  if (host !== 'ohyagroups.net') return null;

  const method = String((req && req.method) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;

  const pathname = String((req && (req.path || req.url)) || '/');
  if (isInternalEndpoint(pathname)) return null;

  const originalUrl = typeof req.originalUrl === 'string' && req.originalUrl ? req.originalUrl : pathname;
  return 'https://www.ohyagroups.net' + originalUrl;
}

module.exports = { getCanonicalHostRedirect };
