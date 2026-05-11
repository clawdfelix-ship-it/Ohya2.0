const fs = require('node:fs');
const path = require('node:path');

function findMissingAssets(entries, existsSync) {
  const missing = [];
  for (const e of entries) {
    const dest = e && e.dest ? String(e.dest) : '';
    if (!dest) continue;
    if (!existsSync(dest)) missing.push(dest);
  }
  return missing;
}

function main() {
  const manifest = path.join(process.cwd(), 'data', 'mzakka-assets.manifest.json');
  const entries = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const missing = findMissingAssets(entries, (p) => {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    return fs.existsSync(abs);
  });

  if (missing.length) {
    process.stderr.write(`Missing assets:\n${missing.join('\n')}\n`);
    process.exit(2);
  }
  process.stdout.write(`OK assets ${entries.length}\n`);
}

if (require.main === module) main();

module.exports = { findMissingAssets };

