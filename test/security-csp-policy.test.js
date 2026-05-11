const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CSP policy does not include unsafe-eval', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(!s.includes("'unsafe-eval'"));
});

test('CSP supports report/enforce mode and report path env', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(s.includes('CSP_MODE'));
  assert.ok(s.includes('CSP_REPORT_PATH'));
});

