#!/usr/bin/env node
'use strict';

/**
 * refresh-mzakka-ranks.js
 *
 * One-command pipeline to refresh the mzakka 標準 (order=0) category ranks:
 *
 *   1. Re-crawl every real taxonomy category page (all pages, cached) so the
 *      local HTML cache reflects the current mzakka order.
 *   2. Extract per-node item order from the cache -> data/mzakka-category-ranks.json
 *   3. Reload mzakka_category_rank in the database (--apply).
 *
 * New products picked up by incremental sync automatically join the ordering
 * on the next refresh; products mzakka removed simply stop getting a rank.
 *
 * Usage:
 *   node scripts/refresh-mzakka-ranks.js            # full refresh + DB apply
 *   node scripts/refresh-mzakka-ranks.js --no-crawl # reuse cache, just reload
 *
 * Requires DATABASE_URL in env (falls back to /tmp/.ohya_db_url for local ops).
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const skipCrawl = args.includes('--no-crawl');

function run(script, scriptArgs = []) {
  console.log(`\n=== $ node scripts/${script} ${scriptArgs.join(' ')} ===`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...scriptArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`step failed: ${script} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

async function main() {
  const t0 = Date.now();
  if (!skipCrawl) {
    // refreshes tmp/mzakka-tax-cache category pages in current 標準 order
    run('build-mzakka-item-leaf-map.js', ['--refresh']);
  }
  run('extract-mzakka-category-ranks.js');
  run('load-mzakka-category-ranks.js', ['--apply']);
  console.log(`\n✅ rank refresh done in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log('redeploy not required — ranks are read live from the DB.');
}

main().catch((e) => { console.error(e); process.exit(1); });
