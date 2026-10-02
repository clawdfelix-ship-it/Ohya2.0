const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('wholesale-match confirm/bulk-confirm persist as manual (not auto)', () => {
  const apiPath = path.join(__dirname, '..', 'routes', 'products-full.js');
  const src = fs.readFileSync(apiPath, 'utf8');

  assert.match(
    src,
    /\/api\/admin\/wholesale-match\/:skuId\/confirm[\s\S]*?match_status\s*=\s*'manual'/,
    'confirm route should mark match_status as manual'
  );
  assert.doesNotMatch(
    src,
    /\/api\/admin\/wholesale-match\/:skuId\/confirm[\s\S]*?match_status\s*=\s*'auto'/,
    'confirm route should not mark match_status as auto'
  );

  assert.match(
    src,
    /\/api\/admin\/wholesale-match\/bulk[\s\S]*?action\s*===\s*'confirm'[\s\S]*?match_status\s*=\s*'manual'/,
    'bulk confirm should mark match_status as manual'
  );
  assert.doesNotMatch(
    src,
    /\/api\/admin\/wholesale-match\/bulk[\s\S]*?action\s*===\s*'confirm'[\s\S]*?match_status\s*=\s*'auto'/,
    'bulk confirm should not mark match_status as auto'
  );
});

test('import-japan-wholesale does not overwrite manual/rejected match_status', () => {
  const fnPath = path.join(__dirname, '..', 'migrations', '2026-10-01-import-japan-wholesale-fn.sql');
  const fnSrc = fs.readFileSync(fnPath, 'utf8');

  assert.match(
    fnSrc,
    /WHERE ps\.id = st\.sku_id[\s\S]*?\(ps\.match_status IS NULL OR ps\.match_status IN \('auto', 'unverified'\)\)/,
    'SQL function should skip rows already marked manual/rejected'
  );

  const scriptPath = path.join(__dirname, '..', 'scripts', 'import-japan-wholesale.js');
  const scriptSrc = fs.readFileSync(scriptPath, 'utf8');

  assert.match(
    scriptSrc,
    /AND \(match_status IS NULL OR match_status IN \('auto', 'unverified'\)\)/,
    'import script should skip rows already marked manual/rejected'
  );
});
