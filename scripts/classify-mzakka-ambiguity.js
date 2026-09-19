#!/usr/bin/env node
'use strict';
// Tier the store's ambiguous items by how much the wrong pick matters.
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');
const ROOT = path.join(__dirname, '..');

const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'item-leaf-map.json'), 'utf8'));
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
const idx = lib.indexTaxonomy(tax);
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'store-source-keys.json'), 'utf8'));

// node id -> chain of ids root->node
const chainOf = new Map();
(function walk(n, chain) {
  chainOf.set(n.id, chain);
  (n.children || []).forEach((c) => walk(c, [...chain, c.id]));
});
// fix walker
(function walk2(n, chain) {
  chainOf.set(n.id, chain);
  (n.children || []).forEach((c) => walk2(c, [...chain, c.id]));
});
for (const r of tax.roots) {
  chainOf.set(r.id, [r.id]);
  (function rec(n, ch) {
    (n.children || []).forEach((c) => {
      const cc = [...ch, c.id];
      chainOf.set(c.id, cc);
      rec(c, cc);
    });
  })(r, [r.id]);
}

const tiers = { t1_multiRoot: [], t2_branch: [], t3_sameBranch: [], other: [] };
for (const k of keys) {
  const v = map.items[k];
  if (!v || !v.ambiguous) continue;
  // candidates = canonical + alternates
  const candIds = [v.canonical, ...(v.alternates || [])];
  const chains = candIds.map((id) => chainOf.get(id)).filter(Boolean);
  const roots = new Set(chains.map((c) => c[0]));
  let t;
  if (roots.size > 1) t = 't1_multiRoot';
  else {
    // distinct L2 within the same root
    const l2 = new Set(chains.map((c) => (c.length >= 2 ? c[1] : c[0])));
    t = l2.size > 1 ? 't2_branch' : 't3_sameBranch';
  }
  tiers[t].push(k);
}

const out = {
  generatedAt: new Date().toISOString(),
  counts: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.length])),
};
for (const [t, arr] of Object.entries(tiers)) {
  fs.writeFileSync(path.join(ROOT, 'tmp', `arbitrate-${t}.json`), JSON.stringify(arr));
}
console.log(out);
