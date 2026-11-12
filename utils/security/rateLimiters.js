const rateLimit = require('express-rate-limit');

function loginLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '請稍後再試' },
  });
}

function adminWriteLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '請稍後再試' },
  });
}

function createAdminWriteMiddleware() {
  // express-rate-limit must be created at app initialization, not per request.
  const limiter = adminWriteLimiter();
  return function adminWriteGate(req, res, next) {
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    return limiter(req, res, next);
  };
}

function webhookLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many requests' },
  });
}

function cspReportLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many requests' },
  });
}

// Conservative first-line abuse control for machine writes. This is process-local:
// serverless instances do not share counters, so it is not a global quota.
function agentWriteLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.agentCredential ? req.agentCredential.id : 'unauthenticated',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many agent writes; retry later', code: 'AGENT_RATE_LIMITED' },
  });
}

module.exports = { loginLimiter, adminWriteLimiter, createAdminWriteMiddleware, agentWriteLimiter, webhookLimiter, cspReportLimiter };
