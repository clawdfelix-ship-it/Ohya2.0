#!/usr/bin/env node
'use strict';

/**
 * extract-mzakka-category-ranks.js
 *
 * Reads the already-cached mzakka category pages (tmp/mzakka-tax-cache/
 * cat-<id>.html + cat-<id>-p<n>.html, crawled in mzakka "標準" order=0) and
 * records the document-order rank of every item within each category node.
 *
 * Each mzakka category page lists ALL items in that node's subtree, so the
 * rank set for a root covers its children too — enough to order the storefront
 * exactly like mzakka at every level.
 *
 * Output (no network):
 *   data/mzakka-category-ranks.json  { nodeId: [itemId, ...] }
 */

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib/mzakka-taxonomy');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tmp', 'mzakka-tax-cache');
const OUT = path.join(ROOT, 'data', 'mzakka-category-ranks.json');

const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));

const nodes = [];
(function walkAll(roots) {
  for (const n of roots) {
    nodes.push(n.id);
    walkAll(n.children || []);
  }
})(tax.roots);

const ranks = {};
let pagesParsed = 0;
let missing = [];

for (const nodeId of nodes) {
  const ordered = [];
  const seen = new Set();
  // page files: cat-<id>.html (p=0), cat-<id>-p1.html, ...
  const files = [path.join(CACHE, `cat-${nodeId}.html`)].concat(
    fs.readdirSync(CACHE)
      .filter((f) => f.startsWith(`cat-${nodeId}-p`) && f.endsWith('.html'))
      .sort((a, b) => {
        const pa = Number(a.match(/-p(\d+)\.html$/)[1]);
        const pb = Number(b.match(/-p(\d+)\.html$/)[1]);
        return pa - pb;
      })
      .map((f) => path.join(CACHE, f))
  );

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    pagesParsed++;
    for (const lk of lib.extractItemLinks(html)) {
      if (lk.category === nodeId && !seen.has(lk.itemId)) {
        seen.add(lk.itemId);
        ordered.push(lk.itemId);
      }
    }
  }
  if (!ordered.length) missing.push(nodeId);
  ranks[nodeId] = ordered;
}

const totals = Object.values(ranks).map((a) => a.length);
const result = {
  generatedAt: new Date().toISOString(),
  source: 'mzakka category list pages, order=0 (標準), from local cache',
  nodeCount: nodes.length,
  pagesParsed,
  emptyNodes: missing,
  ranks,
};
fs.writeFileSync(OUT, JSON.stringify(result));

console.log(`nodes=${nodes.length} pages=${pagesParsed}`);
console.log(`items/root: min=${Math.min(...totals)} max=${Math.max(...totals)}`);
console.log(`empty nodes: ${missing.length ? missing.join(',') : 'none'}`);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);

// sanity: condom root first 12 should match mzakka 標準 order
console.log('\n1826 first 12:', ranks[1826].slice(0, 12).join(', '));
