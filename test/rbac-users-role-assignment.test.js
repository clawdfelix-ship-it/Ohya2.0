const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin users UI includes role selector', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'users.ejs'), 'utf8');
  assert.match(s, /id="user-role"/);
});

test('admin users API reads/writes admin_permissions for role assignment', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'members.js'), 'utf8');
  assert.match(s, /admin_permissions/);
  assert.match(s, /role_id/);
});

test('admin users frontend loads roles', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'users.js'), 'utf8');
  assert.match(s, /\/api\/admin\/roles/);
});

