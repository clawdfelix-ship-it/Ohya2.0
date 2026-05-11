const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('returns flow must not mutate orders.status to refunded', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logistics.js'), 'utf8');
  assert.equal(/UPDATE\s+orders\s+SET\s+status[\s\S]*?refunded/i.test(content), false);
});
