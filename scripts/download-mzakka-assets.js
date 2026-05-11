const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

function parseArgs(argv) {
  const out = { manifest: 'data/mzakka-assets.manifest.json', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--manifest') out.manifest = argv[++i];
  }
  return out;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(get(res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.join(process.cwd(), args.manifest);
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const e of entries) {
    const destAbs = path.isAbsolute(e.dest) ? e.dest : path.join(process.cwd(), e.dest);
    if (args.dryRun) {
      process.stdout.write(`DRY ${e.url} -> ${e.dest}\n`);
      continue;
    }
    if (fs.existsSync(destAbs)) continue;
    ensureDir(destAbs);
    const buf = await get(e.url);
    fs.writeFileSync(destAbs, buf);
    process.stdout.write(`OK ${e.url} -> ${e.dest} (${buf.length})\n`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(String(e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
  });
}

module.exports = { parseArgs };

