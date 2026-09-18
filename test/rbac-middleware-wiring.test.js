const test = require('node:test');
const assert = require('node:assert/strict');

test('requireAdmin rejects backoffice sessions without permissions', async () => {
  const { requireAdmin } = require('../routes/middleware/auth');
  const req = { session: { userId: 12, isAdmin: false, isBackoffice: true } };
  const out = {};
  const res = {
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(payload) {
      out.payload = payload;
      return this;
    }
  };

  await requireAdmin(req, res, () => {
    out.nextCalled = true;
  });

  assert.equal(out.nextCalled, undefined);
  assert.equal(out.statusCode, 401);
  assert.deepEqual(out.payload, { error: '需要管理員權限' });
});

test('requireAdmin allows backoffice sessions with scoped permissions', async () => {
  const { requireAdmin } = require('../routes/middleware/auth');
  const req = { session: { userId: 9, isAdmin: false, isBackoffice: true, adminPermissions: ['orders:read'] } };
  let nextCalled = false;

  await requireAdmin(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, {
    id: 9,
    isAdmin: false,
    permissions: ['orders:read']
  });
});

test('requirePermission middleware exists', () => {
  const auth = require('../routes/middleware/auth');
  assert.equal(typeof auth.requirePermission, 'function');
});
