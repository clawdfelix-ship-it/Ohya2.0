const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin suppliers page exists and loads suppliers.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'suppliers.ejs'), 'utf8');
  assert.match(s, /js\/admin\/common\.js/);
  assert.match(s, /js\/admin\/suppliers\.js/);
});

