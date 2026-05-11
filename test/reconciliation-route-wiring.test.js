const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('reconciliation route is wired in app.js', () => {
  const routePath = path.join(__dirname, '..', 'routes', 'reconciliation.js');
  assert.ok(fs.existsSync(routePath), 'routes/reconciliation.js must exist');

  const appContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appContent, /routes\/reconciliation/);
});

