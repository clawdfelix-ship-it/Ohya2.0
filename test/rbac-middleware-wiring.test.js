const test = require('node:test');
const assert = require('node:assert/strict');

test('requireAdmin allows permissioned backoffice sessions and exposes permissions', () => {
  const { requireAdmin } = require('../routes/middleware/auth');
  const req = {
    session: {
      userId: 8,
      isAdmin: false,
      isBackoffice: true,
      adminPermissions: ['orders:read'],
    }
  };
  let nextCalled = false;
  const res = {
    status() {
      throw new Error('Unexpected rejection');
    }
  };

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, {
    id: 8,
    isAdmin: false,
    permissions: ['orders:read'],
  });
});

test('requireAdmin rejects backoffice sessions without permissions', () => {
  const { requireAdmin } = require('../routes/middleware/auth');
  const req = {
    session: {
      userId: 8,
      isAdmin: false,
      isBackoffice: true,
      adminPermissions: [],
    }
  };
  let statusCode = null;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  requireAdmin(req, res, () => {
    throw new Error('Unexpected success');
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(payload, { error: '需要管理員權限' });
});

test('requirePermission middleware exists', () => {
  const { requirePermission } = require('../routes/middleware/auth');
  assert.equal(typeof requirePermission, 'function');
});
