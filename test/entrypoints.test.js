const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getRoutePaths(app) {
  const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : [];
  return stack
    .map((layer) => layer && layer.route && layer.route.path)
    .filter((p) => typeof p === 'string');
}

test('Vercel entrypoint exports the full backend app (has /api/health route)', () => {
  const app = require(path.join('..', 'api', 'index.js'));
  assert.equal(typeof app, 'function');
  const paths = getRoutePaths(app);
  assert.ok(paths.includes('/api/health'));
});

test('DB pool getter is a singleton within the process', () => {
  const modulePath = path.join(__dirname, '..', 'utils', 'getPool.js');
  assert.ok(fs.existsSync(modulePath));
  const { getPool } = require(path.join('..', 'utils', 'getPool'));
  const a = getPool();
  const b = getPool();
  assert.equal(a, b);
});
