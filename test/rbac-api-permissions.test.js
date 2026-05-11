const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(p) {
  return fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
}

test('products-full uses requirePermission for catalog/inventory endpoints', () => {
  const s = read('routes/products-full.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /inventory:read/);
  assert.match(s, /inventory:write/);
  assert.match(s, /catalog:read/);
  assert.match(s, /catalog:write/);
});

test('reports endpoints use requirePermission(reports:read)', () => {
  const s = read('routes/reports.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /reports:read/);
});

test('refunds endpoints use requirePermission(refunds:read|refunds:write)', () => {
  const s = read('routes/refunds.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /refunds:read/);
  assert.match(s, /refunds:write/);
});

test('returns endpoints use requirePermission(returns:read|returns:write)', () => {
  const s = read('routes/logistics.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /returns:read/);
  assert.match(s, /returns:write/);
});

test('categories endpoints use requirePermission(catalog:write)', () => {
  const s = read('routes/categories.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /catalog:write/);
});

test('reconciliation endpoints use requirePermission(reconciliation:read)', () => {
  const s = read('routes/reconciliation.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /reconciliation:read/);
});

test('admin bulk skus endpoints use requirePermission(inventory:bulk)', () => {
  const s = read('routes/admin.js');
  assert.match(s, /requirePermission/);
  assert.match(s, /inventory:bulk/);
});
