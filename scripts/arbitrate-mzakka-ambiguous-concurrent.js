#!/usr/bin/env node
'use strict';

/**
 * arbitrate-mzakka-ambiguous-concurrent.js
 *
 * Breadcrumb arbitration for ALL store-ambiguous items (T1 multi-root +
 * T2 same-root cross-branch + T3). Uses the item page's first/authoritative
 * real breadcrumb chain (lib.resolveCanonicalLeaf, validated 49/49).
 *
 * 3 independent polite workers (~3.5 req/s aggregate), disk-cached,
 * resumable: progress is snapshotted every 25 items.
 *
 * Output:
 *   tmp/item-leaf-map-resolved.json   full map with corrected canonicals
 *   tmp/item-leaf-arbitration.jsonl   one audit line per arbitrated item
 *   tmp/arbitration-progress.json     resume cursor
 */

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const CACHE = path.join(TMP, 'mzakka-tax-cache');
const WORKERS = 3;
const DELAY_MS = 850;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeWorker(index) {
  let last = 0;
  async function getItem(itemId) {
    const file = path.join(CACHE, `item-${itemId}.html`);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    const wait = DELAY_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const url = `${lib.BASE}/item.php?item_id=${encodeURIComponent(itemId)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Ohya2Categorization/1.0',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.text();
    fs.writeFileSync(file, body);
    return body;
  }
  return { index, getItem };
}

(async () => {
  const mapPath = path.join(TMP, 'item-leaf-map.json');
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
  const index = lib.indexTaxonomy(tax);

  const t1 = JSON.parse(fs.readFileSync(path.join(TMP, 'arbitrate-t1_multiRoot.json'), 'utf8'));
  const t2 = JSON.parse(fs.readFileSync(path.join(TMP, 'arbitrate-t2_branch.json'), 'utf8'));
  const t3 = JSON.parse(fs.readFileSync(path.join(TMP, 'arbitrate-t3_sameBranch.json'), 'utf8'));
  const targets = [...t1, ...t2, ...t3];

  const auditPath = path.join(TMP, 'item-leaf-arbitration.jsonl');
  const progressPath = path.join(TMP, 'arbitration-progress.json');
  const done = new Set();
  if (fs.existsSync(progressPath)) {
    const p = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    for (const id of p.done || []) done.add(id);
  }
  const auditStream = fs.createWriteStream(auditPath, { flags: 'a' });

  const queue = targets.filter((id) => !done.has(id));
  console.log(`total targets=${targets.length} remaining=${queue.length}`);

  let changed = 0;
  let kept = 0;
  let unresolved = 0;
  let processed = 0;
  const t0 = Date.now();

  async function worker(w) {
    while (queue.length) {
      const itemId = queue.shift();
      const cur = map.items[itemId];
      if (!cur) continue;
      const before = cur.canonical;
      let after = before;
      let reason = null;
      try {
        const html = await w.getItem(itemId);
        const result = lib.resolveCanonicalLeaf(html, index);
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
          reason = result.reason;
        }
      } catch (e) {
        unresolved++;
        cur.arbitrated = 'fetch-error';
        reason = e.message;
      }
      auditStream.write(JSON.stringify({ itemId, before, after, changed: after !== before, reason }) + '\n');
      done.add(itemId);
      processed++;
      if (processed % 25 === 0) {
        fs.writeFileSync(progressPath, JSON.stringify({ done: [...done], savedAt: new Date().toISOString() }));
        const el = (Date.now() - t0) / 1000;
        const rate = processed / el;
        console.log(`  ${processed}/${targets.length - (done.size - processed)} done=${done.size}/${targets.length} ` +
          `changed=${changed} kept=${kept} unres=${unresolved} rate=${rate.toFixed(2)}/s eta=${Math.round((targets.length - done.size) / rate / 60)}min`);
      }
    }
  }

  const workers = Array.from({ length: WORKERS }, (_, i) => makeWorker(i));
  await Promise.all(workers.map(worker));
  auditStream.end();

  // unresolved/error items: retry once in 30s would complicate; leave flagged.
  map.stats = {
    ...map.stats,
    arbitratedAt: new Date().toISOString(),
    arbitrationTargets: targets.length,
    arbitrationChanged: changed,
    arbitrationKept: kept,
    arbitrationUnresolved: unresolved,
    arbitrationElapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(path.join(TMP, 'item-leaf-map-resolved.json'), JSON.stringify(map));
  fs.writeFileSync(progressPath, JSON.stringify({ done: [...done], finished: true, stats: map.stats }, null, 1));

  const d = { 1: 0, 2: 0, 3: 0 };
  for (const v of Object.values(map.items)) d[v.depth] = (d[v.depth] || 0) + 1;
  console.log('=== ARBITRATION DONE ===');
  console.log(JSON.stringify(map.stats, null, 2));
  console.log('whole-map depth:', d);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
