const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('app wires CSP report endpoint and CSRF skip', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(s.includes('cspReportPath'));
  assert.ok(s.includes('cspReportLimiter'));
  assert.ok(s.includes("console.warn('CSP report'"));
  assert.ok(s.includes('CSP_REPORT_PATH'));
});

