#!/usr/bin/env node
'use strict';

/**
 * build-mzakka-taxonomy.js
 *
 * Build data/mzakka-taxonomy.json — the REAL 2-3 level product taxonomy of
 * mzakka.com — by walking the 13 root category pages and their (real) child
 * pages, using scripts/lib/mzakka-taxonomy.js to discard facet / brand /
 * promotion nodes.
 *
 * Usage:
 *   node scripts/build-mzakka-taxonomy.js            # use cached HTML
 *   node scripts/build-mzakka-taxonomy.js --refresh  # re-download (polite)
 *   node scripts/build-mzakka-taxonomy.js --max-depth=2
 *
 * Network: GET mzakka.com only, sequential, >=850ms between requests.
 */

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'tmp', 'mzakka-tax-cache');
const OUT_FILE = path.join(ROOT, 'data', 'mzakka-taxonomy.json');

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const maxDepthArg = (args.find((a) => a.startsWith('--max-depth=')) || '').split('=')[1];
const MAX_DEPTH = maxDepthArg ? Number(maxDepthArg) : 3; // root = depth 1

/**
 * Root-specific overrides.
 * 1801 (オナホール・おっぱい) #sub is a messy legacy bag: it mixes the one
 * canonical type group (2810 タイプ・サイズ別) with brand nodes, facet groups
 * AND legacy parallel ids for facet leaves (2635 ヒダ系 == facet 2825,
 * 2642 ハード系 == 2843, 2151 トルソー型 == 2830, ...). mzakka's own editorial
 * block names only タイプ・サイズ別 as the type taxonomy, and items carry the
 * 2810 > leaf chain as their single type assignment. So for 1801 we keep ONLY
 * 2810 and walk its group page for the real leaves (2814..2824).
 */
const ROOT_CHILD_OVERRIDE = {
  1801: [2810],
};

function log(...a) {
  process.stdout.write(a.join(' ') + '\n');
}

async function main() {
  const fetcher = lib.createFetcher({ cacheDir: CACHE_DIR, refresh: REFRESH, delayMs: 850 });

  // Global maker dictionary (same on every page).
  const firstRootHtml = await fetcher.categoryPage(lib.ROOTS[0].id);
  const makerIds = lib.extractMakerIds(firstRootHtml);
  log(`maker dictionary: ${makerIds.size} brand ids from #makert1`);

  const tree = [];
  const facetReport = {};
  let totalNodes = 0;
  let maxDepthSeen = 1;

  for (const root of lib.ROOTS) {
    const rootHtml = await fetcher.categoryPage(root.id);
    const parsed = lib.extractRootChildren(rootHtml, root.id, { makerIds });
    facetReport[root.id] = parsed.dropped.map((d) => ({ id: d.id, name: d.name, reason: d.reason }));

    let childIds;
    if (ROOT_CHILD_OVERRIDE[root.id]) {
      const allow = new Set(ROOT_CHILD_OVERRIDE[root.id]);
      childIds = parsed.children.filter((c) => allow.has(c.id));
      // also make sure override ids get names even if filter disagreed
      for (const id of ROOT_CHILD_OVERRIDE[root.id]) {
        if (!childIds.some((c) => c.id === id)) {
          const cand = parsed.candidates.find((c) => c.id === id);
          if (cand) childIds.push(cand);
        }
      }
    } else {
      childIds = parsed.children;
    }

    const node = { id: root.id, name: root.name, children: [] };
    totalNodes++;

    log('');
    log(`■ ${root.id} ${root.name} — ${childIds.length} real L2 children, ` +
      `${parsed.dropped.length} facet/brand nodes dropped`);
    parsed.dropped.forEach((d) => log(`    ✕ ${d.id} ${d.name}  (${d.reason})`));

    // L2
    for (const l2 of childIds) {
      const l2Node = { id: l2.id, name: l2.name, children: [] };
      totalNodes++;
      maxDepthSeen = Math.max(maxDepthSeen, 2);

      if (MAX_DEPTH >= 3) {
        const l2Html = await fetcher.categoryPage(l2.id);
        const sub = lib.extractRootChildren(l2Html, root.id, { makerIds });
        // On a child page, only treat default-real / curated-real candidates as
        // L3 whose page breadcrumb really hangs off THIS node. Candidates that
        // are facet groups/brands are already filtered. Guard against siblings
        // leaking in: require the L3 id != every known root/l2 id.
        const l2Ids = new Set(childIds.map((c) => c.id));
        const l3 = sub.children.filter((c) => !lib.ROOT_IDS.has(c.id) && !l2Ids.has(c.id) && c.id !== root.id);
        sub.dropped.forEach((d) =>
          log(`    ✕(${l2.id}) ${d.id} ${d.name}  (${d.reason})`));
        for (const c of l3) {
          l2Node.children.push({ id: c.id, name: c.name, children: [] });
          totalNodes++;
          maxDepthSeen = Math.max(maxDepthSeen, 3);
        }
        if (l3.length) log(`    └ ${l2.id} ${l2.name} → ${l3.length} L3: ` + l3.map((c) => c.name).join(' / '));
        else log(`    └ ${l2.id} ${l2.name} (leaf)`);
      } else {
        log(`    └ ${l2.id} ${l2.name} (leaf, max-depth=2)`);
      }

      node.children.push(l2Node);
    }

    tree.push(node);
  }

  // Integrity checks
  const seen = new Map();
  const dupes = [];
  function walk(n, depth) {
    if (seen.has(n.id)) dupes.push({ id: n.id, a: seen.get(n.id), b: depth });
    seen.set(n.id, depth);
    (n.children || []).forEach((c) => walk(c, depth + 1));
  }
  for (const n of tree) walk(n, 1);

  const bannedHits = [];
  const bannedSubstrings = ['ランキング', 'メーカー', '素材別', 'パッケージ', 'セール', 'ヒダ系', 'ハード素材', 'ソフト素材', 'クリア素材', '三次元写真', '二次元イラスト', '年上半期', '年下半期'];
  function scan(n) {
    for (const bad of bannedSubstrings) if (n.name.includes(bad)) bannedHits.push(`${n.id}:${n.name}`);
    (n.children || []).forEach(scan);
  }
  for (const n of tree) scan(n);

  const result = {
    generatedAt: new Date().toISOString(),
    source: 'https://mzakka.com/pc/detail/category.php',
    note: 'Real product taxonomy. Facet/brand/promotion nodes excluded; see data/mzakka-product-canonical-category-plan.md',
    roots: tree,
    facetGroupIds: lib.FACET_GROUP_IDS,
    excludedNodes: facetReport,
    stats: {
      roots: tree.length,
      totalNodes,
      maxDepth: maxDepthSeen,
      duplicateIds: dupes,
      bannedNameHits: bannedHits,
    },
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n');

  log('');
  log('================ SUMMARY ================');
  for (const r of tree) {
    const l3 = r.children.reduce((a, c) => a + c.children.length, 0);
    log(`${r.id} ${r.name.padEnd(18)} L2=${String(r.children.length).padStart(2)} L3=${String(l3).padStart(2)}`);
  }
  log(`roots=${result.stats.roots} totalNodes=${totalNodes} maxDepth=${maxDepthSeen}`);
  log(`duplicate ids: ${dupes.length}${dupes.length ? ' ' + JSON.stringify(dupes) : ''}`);
  log(`banned-name hits: ${bannedHits.length}${bannedHits.length ? ' ' + bannedHits.join(',') : ''}`);
  log(`written: ${path.relative(ROOT, OUT_FILE)}`);
  if (dupes.length || bannedHits.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
