'use strict';

const DEFAULT_CANONICAL_BASE = 'https://www.ohyagroups.com';
const REDIRECT_SOURCE_HOSTS = new Set([
  'ohyagroups.net',
  'www.ohyagroups.net',
  'ohyagroups.com',
]);

function requestHostname(req) {
  const forwarded = req.get('x-forwarded-host');
  const raw = String(forwarded || req.get('host') || '').split(',')[0].trim().toLowerCase();
  // Strip a numeric port but never use an unvalidated host in a redirect target.
  const hostname = raw.replace(/:\d+$/, '');
  return /^[a-z0-9.-]+$/.test(hostname) ? hostname : '';
}

function isTechnicalPath(pathname) {
  return String(pathname || '').startsWith('/api/internal/')
    || String(pathname || '').startsWith('/webhooks/');
}

function createDomainRedirectMiddleware() {
  return function domainRedirect(req, res, next) {
    // Cron and payment/webhook endpoints retain their existing request/response behavior.
    if (isTechnicalPath(req.path)) return next();

    const target = REDIRECT_SOURCE_HOSTS.has(requestHostname(req));
    if (!target) return next();

    const originalUrl = String(req.originalUrl || '/');
    // Never construct an absolute Location from CR/LF or scheme-relative input.
    if (!originalUrl.startsWith('/') || originalUrl.startsWith('//') || /[\r\n]/.test(originalUrl)) return next();

    // Preserve exact path/query; res.location encodes without an HTML redirect body.
    return res.status(308).location(DEFAULT_CANONICAL_BASE + originalUrl).end();
  };
}

module.exports = {
  DEFAULT_CANONICAL_BASE,
  createDomainRedirectMiddleware,
  isTechnicalPath,
  requestHostname,
};
