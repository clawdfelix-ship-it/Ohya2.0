const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCspReports } = require('../utils/security/cspReport');

test('normalizeCspReports supports legacy csp-report', () => {
  const items = normalizeCspReports({
    'csp-report': {
      'blocked-uri': 'https://cdn.tailwindcss.com/x.js?token=abc',
      'violated-directive': 'script-src',
      'source-file': 'https://example.com/admin?x=1',
    },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].blockedUri, 'https://cdn.tailwindcss.com/x.js');
  assert.equal(items[0].sourceFile, 'https://example.com/admin');
});

test('normalizeCspReports supports reports+json array', () => {
  const items = normalizeCspReports([
    {
      type: 'csp-violation',
      body: { blockedURL: 'https://evil.com/a.js?x=1', violatedDirective: 'script-src' },
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].blockedUri, 'https://evil.com/a.js');
});

