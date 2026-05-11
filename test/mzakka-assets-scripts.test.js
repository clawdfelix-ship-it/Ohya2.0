const test = require('node:test');
const assert = require('node:assert/strict');

test('download assets script: parses args', () => {
  const { parseArgs } = require('../scripts/download-mzakka-assets');
  const out = parseArgs(['node', 'x', '--dry-run', '--manifest', 'data/x.json']);
  assert.equal(out.dryRun, true);
  assert.equal(out.manifest, 'data/x.json');
});

test('verify assets script: finds missing dest paths', () => {
  const { findMissingAssets } = require('../scripts/verify-mzakka-assets');
  const entries = [{ dest: 'public/a.png' }, { dest: 'public/b.png' }];
  const missing = findMissingAssets(entries, (p) => p === 'public/a.png');
  assert.deepEqual(missing, ['public/b.png']);
});
