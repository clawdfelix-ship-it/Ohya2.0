#!/usr/bin/env node
'use strict';

/**
 * arbitrate-mzakka-ambiguous.js
 *
 * For every item flagged ambiguous=true in tmp/item-leaf-map.json (same-depth
 * candidates across/within roots), fetch the mzakka item page and use the
 * lib's multi-line breadcrumb resolver (plan §4, tested 49/49 on cross-root
 * samples) to pick the authoritative leaf.
 *
 * Writes:
 *   tmp/item-leaf-map-resolved.json  (full map with overwritten canonicals)
 *   tmp/item-leaf-arbitration.json   (per-item before/after audit)
 *
 * GET mzakka.com only, sequential ~900ms, cached. READ-ONLY vs our DB.
 *
 * Usage: node scripts/arbitrate-mzakka-ambiguous.js [--limit=N] [--refresh]
 */

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const refresh = process.argv.includes('--refresh');

(async () => {
  const map = JSON.parse(fs.readFileSync(path.join(TMP, 'item-leaf-map.json'), 'utf8'));
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
  const index = lib.indexTaxonomy(tax);

  const targets = Object.entries(map.items)
    .filter(([, v]) => v.ambiguous)
    .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

  console.log(`ambiguous items to arbitrate: ${targets.length}`);

  const fetcher = lib.createFetcher({
    cacheDir: path.join(TMP, 'mzakka-tax-cache'),
    refresh,
    delayMs: 900,
  });

  const audit = [];
  let changed = 0;
  let kept = 0;
  let unresolved = 0;
  const t0 = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const [itemId, cur] = targets[i];
    let result = { leaf: null, reason: 'fetch-error' };
    try {
      const html = await fetcher.itemPage(itemId);
      result = lib.resolveCanonicalLeaf(html, index);
    } catch (e) {
      result = { leaf: null, reason: 'fetch-error:' + e.message };
    }

    const before = cur.canonical;
    let after = before;
    if (result.leaf && result.leaf.id) {
      after = result.leaf.id;
      cur.canonical = result.leaf.id;
      cur.depth = (index.byId.get(after) || {}).depth || cur.depth;
      cur.rootId = result.rootId || cur.rootId;
      cur.ambiguous = false;
      cur.arbitrated = 'breadcrumb';
      if (after !== before) changed++; else kept++;
    } else {
      unresolved++;
      cur.arbitrated = 'unresolved:' + (result.reason || 'no-leaf');
      // keep deterministic list-based rule result; flag for review
    }

    audit.push({ itemId, before, after, changed: after !== before, reason: result.reason || null });

    if ((i + 1) % 100 === 0 || i + 1 === targets.length) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${i + 1}/${targets.length}  changed=${changed} kept=${kept} unresolved=${unresolved}  ${el}s`);
    }
  }

  map.stats = {
    ...map.stats,
    arbitratedAt: new Date().toISOString(),
    ambiguousTotal: targets.length,
    arbitrationChanged: changed,
    arbitrationKept: kept,
    arbitrationUnresolved: unresolved,
    arbitrationElapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
  };

  fs.writeFileSync(path.join(TMP, 'item-leaf-map-resolved.json'), JSON.stringify(map));
  fs.writeFileSync(path.join(TMP, 'item-leaf-arbitration.json'), JSON.stringify(audit, null, 1));

  // final depth distribution over whole store map
  const d = { 1: 0, 2: 0, 3: 0 };
  for (const v of Object.values(map.items)) d[v.depth] = (d[v.depth] || 0) + 1;
  console.log('\n=== ARBITRATION DONE ===');
  console.log(JSON.stringify(map.stats, null, 2));
  console.log('whole-map canonical depth:', d);
})().catch((e) => { console.error(e); process.exit(1); });
