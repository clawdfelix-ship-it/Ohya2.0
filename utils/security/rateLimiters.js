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

module.exports = { loginLimiter, adminWriteLimiter, agentWriteLimiter, webhookLimiter, cspReportLimiter };
