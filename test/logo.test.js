const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('homepage top-left logo text is OHYA2.0', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.ejs'), 'utf8');
  assert.ok(content.includes('OHYA2.0'), 'header.ejs should contain OHYA2.0 logo text');
});
