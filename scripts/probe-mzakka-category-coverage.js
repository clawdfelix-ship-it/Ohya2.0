#!/usr/bin/env node
'use strict';

/**
 * probe-mzakka-category-coverage.js
 *
 * Empirical coverage probe for the canonical-leaf assignment PLAN
 * (see data/mzakka-product-canonical-category-plan.md). It crawls ALL pages
 * of one real taxonomy root (root -> L2 -> L3), assigning every encountered
 * item to its DEEPEST real node, then reports how many items end up at L3/L2
 * vs. root-only.
 *
 * Usage:
 *   node scripts/probe-mzakka-category-coverage.js --root=1826
 *   node scripts/probe-mzakka-category-coverage.js --root=1831 --refresh
 *
 * GET mzakka.com only, sequential, ~850ms politeness delay, disk cached.
 */

const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');

async function crawlNode(fetcher, catId) {
  const first = await fetcher.categoryPage(catId, 0);
  const paging = lib.extractPaging(first);
  const pages = paging.pages || 1;
  const items = new Set();
  for (let p = 0; p < pages; p++) {
    const html = p === 0 ? first : await fetcher.categoryPage(catId, p);
    for (const l of lib.extractItemLinks(html)) items.add(l.itemId);
  }
  return { total: paging.total, pages, items };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const rootId = Number((arg || '').split('=')[1]);
  const refresh = process.argv.includes('--refresh');
  if (!rootId) throw new Error('--root=<id> required');

  const tax = require(path.join(ROOT, 'data', 'mzakka-taxonomy.json'));
  const root = tax.roots.find((r) => r.id === rootId);
  if (!root) throw new Error(`root ${rootId} not in taxonomy`);

  const fetcher = lib.createFetcher({
    cacheDir: path.join(ROOT, 'tmp', 'mzakka-tax-cache'),
    refresh,
    delayMs: 850,
  });

  const assign = new Map(); // itemId -> {nodeId, depth}
  let requests = 0;
  const t0 = Date.now();

  const r0 = await crawlNode(fetcher, root.id);
  requests += r0.pages;
  for (const it of r0.items) assign.set(it, { nodeId: root.id, depth: 1 });

  for (const l2 of root.children) {
    const r2 = await crawlNode(fetcher, l2.id);
    requests += r2.pages;
    for (const it of r2.items) {
      const cur = assign.get(it);
      if (!cur || cur.depth < 2) assign.set(it, { nodeId: l2.id, depth: 2 });
    }
    for (const l3 of l2.children) {
      const r3 = await crawlNode(fetcher, l3.id);
      requests += r3.pages;
      for (const it of r3.items) {
        const cur = assign.get(it);
        if (!cur || cur.depth < 3) assign.set(it, { nodeId: l3.id, depth: 3 });
      }
    }
  }

  const byDepth = { 1: 0, 2: 0, 3: 0 };
  for (const a of assign.values()) byDepth[a.depth]++;
  const leafOrSub = byDepth[2] + byDepth[3];

  console.log(JSON.stringify({
    root: root.id,
    name: root.name,
    rootDeclaredTotal: r0.total,
    uniqueItemsSeen: assign.size,
    assignedL3: byDepth[3],
    assignedL2: byDepth[2],
    rootOnly: byDepth[1],
    pctBelowRoot: ((leafOrSub / assign.size) * 100).toFixed(1) + '%',
    categoryPageRequests: requests,
    elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
