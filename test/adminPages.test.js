const test = require('node:test');
const assert = require('node:assert/strict');

test('adminBootstrap: hasAdmin queries users.is_admin', async () => {
  const { hasAdmin } = require('../utils/adminBootstrap');
  const calls = [];
  const fakePool = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [{ exists: true }] };
    },
  };
  const out = await hasAdmin(fakePool);
  assert.equal(out, true);
  assert.match(calls[0], /FROM\s+users/i);
  assert.match(calls[0], /is_admin\s*=\s*true/i);
});

test('adminBootstrap: createFirstAdmin inserts admin user with bcrypt hash', async () => {
  const { createFirstAdmin } = require('../utils/adminBootstrap');
  const calls = [];
  const fakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/INSERT\s+INTO\s+users/i.test(sql)) {
        return { rows: [{ id: 9, username: params[0], is_admin: true }] };
      }
      return { rows: [] };
    },
  };
  const out = await createFirstAdmin(fakePool, { username: 'admin', password: 'admin123', contact: '' });
  assert.equal(out.id, 9);
  assert.equal(out.username, 'admin');
  assert.equal(out.is_admin, true);
  assert.match(String(calls[0].params[1]), /^\$2[aby]\$/);
});

test('adminPages: setupEnabled blocks when admin exists', async () => {
  const adminPages = require('../routes/adminPages');
  const out = await adminPages.setupEnabled({ hasAdmin: async () => true });
  assert.equal(out, false);
});

test('adminPages: isAdminSession requires userId + (isAdmin or isBackoffice)', () => {
  const adminPages = require('../routes/adminPages');
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: true }), true);
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: false, isBackoffice: true }), true);
  assert.equal(adminPages.isAdminSession({ userId: 1, isAdmin: false, isBackoffice: false }), false);
  assert.equal(adminPages.isAdminSession({}), false);
});

test('adminPages: requireAdminPage redirects to /admin/login when not admin', async () => {
  const adminPages = require('../routes/adminPages');
  const mw = adminPages.requireAdminPage();
  let redirected = null;
  const req = { session: {} };
  const res = { redirect: (u) => (redirected = u) };
  await mw(req, res, () => {});
  assert.equal(redirected, '/admin/login');
});
