const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin reports page exists and loads reports.js', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'reports.ejs'), 'utf8');
  assert.match(s, /js\/admin\/common\.js/);
  assert.match(s, /js\/admin\/reports\.js/);
});

