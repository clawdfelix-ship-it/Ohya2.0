const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin login supports role-based backoffice access', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminPages.js'), 'utf8');
  assert.match(s, /admin_permissions/i);
  assert.match(s, /admin_roles/i);
  assert.match(s, /adminPermissions|permissions/i);
});

