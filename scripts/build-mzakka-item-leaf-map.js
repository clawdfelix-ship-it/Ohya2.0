#!/usr/bin/env node
'use strict';

/**
 * build-mzakka-item-leaf-map.js
 *
 * Full-store crawl of the 257 REAL taxonomy nodes (data/mzakka-taxonomy.json):
 * walks root -> L2 -> L3, paginates every category list page (200/page),
 * and records every item with each node it appears in.
 *
 * Output (tmp/):
 *   - item-leaf-map.json    : { generatedAt, stats, items: { itemId: { canonical, candidates:[...] } } }
 *   - item-leaf-map.jsonl   : one line per item (same payload, streaming-friendly)
 *   - item-leaf-map-report.json : per-root coverage + ambiguity stats
 *
 * GET mzakka.com only. Sequential, ~850ms delay, disk-cached (resumable).
 * Does NOT touch the database.
 *
 * Usage:
 *   node scripts/build-mzakka-item-leaf-map.js            # cache-first
 *   node scripts/build-mzakka-item-leaf-map.js --refresh  # ignore cache
 */

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const refresh = process.argv.includes('--refresh');

const B2B_ROOT = 1865; // 業務用 — cross-cutting B2B catalog, always yields to product roots

async function crawlNode(fetcher, catId) {
  const first = await fetcher.categoryPage(catId, 0);
  const paging = lib.extractPaging(first);
  const pages = paging.pages || 1;
  const items = new Set();
  for (const l of lib.extractItemLinks(first)) {
    if (l.category === catId) items.add(l.itemId);
  }
  for (let p = 1; p < pages; p++) {
    const html = await fetcher.categoryPage(catId, p);
    for (const l of lib.extractItemLinks(html)) {
      if (l.category === catId) items.add(l.itemId);
    }
  }
  return { declaredTotal: paging.total, pages, items: [...items] };
}

/**
 * Pick canonical node among candidates.
 * Rule (per plan §5): deepest wins; on tie the 1865 B2B root yields;
 * if still tied -> ambiguous (smallest node id, deterministic; flagged).
 */
function pickCanonical(candidates) {
  const maxDepth = Math.max(...candidates.map((c) => c.depth));
  let pool = candidates.filter((c) => c.depth === maxDepth);
  let b2bYielded = false;
  if (pool.length > 1 && pool.some((c) => c.rootId === B2B_ROOT) &&
      pool.some((c) => c.rootId !== B2B_ROOT)) {
    pool = pool.filter((c) => c.rootId !== B2B_ROOT);
    b2bYielded = true;
  }
  pool.sort((a, b) => a.nodeId - b.nodeId);
  return { canonical: pool[0], ambiguous: pool.length > 1, b2bYielded };
}

async function main() {
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
  fs.mkdirSync(TMP, { recursive: true });
  const fetcher = lib.createFetcher({
    cacheDir: path.join(ROOT, 'tmp', 'mzakka-tax-cache'),
    refresh,
    delayMs: 850,
  });

  /** @type {Map<string, Array<{rootId:number,nodeId:number,depth:number}>>} */
  const itemCandidates = new Map();
  const perRoot = [];
  let pageRequests = 0;
  const t0 = Date.now();

  const add = (itemId, rootId, nodeId, depth) => {
    const arr = itemCandidates.get(itemId) || [];
    if (!arr.some((c) => c.nodeId === nodeId)) arr.push({ rootId, nodeId, depth });
    itemCandidates.set(itemId, arr);
  };

  for (const root of tax.roots) {
    const rt0 = Date.now();
    const r0 = await crawlNode(fetcher, root.id);
    pageRequests += r0.pages;
    for (const id of r0.items) add(id, root.id, root.id, 1);
    const rootItemCount = new Set(r0.items);

    for (const l2 of root.children || []) {
      const r2 = await crawlNode(fetcher, l2.id);
      pageRequests += r2.pages;
      for (const id of r2.items) { add(id, root.id, l2.id, 2); rootItemCount.add(id); }
      for (const l3 of l2.children || []) {
        const r3 = await crawlNode(fetcher, l3.id);
        pageRequests += r3.pages;
        for (const id of r3.items) { add(id, root.id, l3.id, 3); rootItemCount.add(id); }
      }
    }

    const inRootItems = [...rootItemCount];
    const belowRoot = inRootItems.filter((id) =>
      (itemCandidates.get(id) || []).some((c) => c.rootId === root.id && c.depth >= 2));
    perRoot.push({
      rootId: root.id, name: root.name,
      declaredTotal: r0.declaredTotal,
      uniqueItemsInRootTree: inRootItems.length,
      belowRoot: belowRoot.length,
      rootOnly: inRootItems.length - belowRoot.length,
      pctBelowRoot: +((belowRoot.length / inRootItems.length) * 100).toFixed(1),
      elapsedSec: +((Date.now() - rt0) / 1000).toFixed(1),
    });
    console.log(`[${root.id}] ${root.name}: ${inRootItems.length} items ` +
      `(${(belowRoot.length / inRootItems.length * 100).toFixed(1)}% below root), ` +
      `${perRoot.at(-1).elapsedSec}s`);
  }

  // Resolve canonical leaf per item
  const items = {};
  let ambiguous = 0;
  let multiRoot = 0;
  let b2bYieldedCount = 0;
  const byCanonicalDepth = { 1: 0, 2: 0, 3: 0 };
  for (const [itemId, candidates] of itemCandidates) {
    const roots = new Set(candidates.map((c) => c.rootId));
    if (roots.size > 1) multiRoot++;
    const { canonical, ambiguous: amb, b2bYielded } = pickCanonical(candidates);
    if (amb) ambiguous++;
    if (b2bYielded) b2bYieldedCount++;
    byCanonicalDepth[canonical.depth]++;
    items[itemId] = {
      canonical: canonical.nodeId,
      depth: canonical.depth,
      rootId: canonical.rootId,
      multiRoot: roots.size > 1,
      ambiguous: amb,
      alternates: candidates
        .filter((c) => c.nodeId !== canonical.nodeId)
        .map((c) => c.nodeId),
    };
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    totalUniqueItems: itemCandidates.size,
    canonicalByDepth: byCanonicalDepth,
    multiRootItems: multiRoot,
    ambiguousItems: ambiguous,
    b2bYieldedItems: b2bYieldedCount,
    categoryPageRequests: pageRequests,
    elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
  };

  fs.writeFileSync(
    path.join(TMP, 'item-leaf-map.json'),
    JSON.stringify({ stats, perRoot, items }, null, 0));
  fs.writeFileSync(
    path.join(TMP, 'item-leaf-map-report.json'),
    JSON.stringify({ stats, perRoot }, null, 2));
  const jsonl = Object.entries(items)
    .map(([itemId, v]) => JSON.stringify({ itemId, ...v })).join('\n') + '\n';
  fs.writeFileSync(path.join(TMP, 'item-leaf-map.jsonl'), jsonl);

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
