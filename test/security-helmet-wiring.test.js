const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('helmet middleware is wired in app.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(s, /require\('helmet'\)/);
  assert.match(s, /app\.use\(helmet\(/);
});

