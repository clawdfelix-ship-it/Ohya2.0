#!/usr/bin/env node
'use strict';

/**
 * dryrun-mzakka-category-remap.js — READ-ONLY
 *
 * Compares every products.source_key (mzakka items in the store DB)
 * against tmp/item-leaf-map.json and reports coverage + category impact.
 * Writes nothing to the database.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const dbUrl = (process.env.DATABASE_URL || '').trim() || fs.readFileSync('/tmp/.ohya_db_url','utf8').trim();

(async () => {
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'item-leaf-map.json'), 'utf8'));
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));

  // node id -> {name, depth, parent}
  const nodeName = new Map();
  const walk = (n, d, p, rootId) => {
    nodeName.set(n.id, { name: n.name, depth: d, parent: p, rootId });
    (n.children || []).forEach((c) => walk(c, d + 1, n.id, rootId));
  };
  tax.roots.forEach((r) => walk(r, 1, null, r.id));

  const q = (sql, params = []) => pool.query(sql, params);

  const { rows: prodRows } = await q(
    `SELECT id, source_key, slug FROM products WHERE source = 'mzakka'`);
  const { rows: allProd } = await q(`SELECT count(*)::int c FROM products`);
  const { rows: catCount } = await q(`SELECT count(*)::int c FROM categories`);

  const dbKeys = new Set(prodRows.map((r) => String(r.source_key).trim()));
  const crawled = new Set(Object.keys(map.items));

  let matched = 0;
  const byDepth = { 1: 0, 2: 0, 3: 0 };
  const byRoot = new Map();
  const unmatched = [];
  for (const r of prodRows) {
    const k = String(r.source_key).trim();
    const m = map.items[k];
    if (m) {
      matched++;
      byDepth[m.depth]++;
      byRoot.set(m.rootId, (byRoot.get(m.rootId) || 0) + 1);
    } else {
      unmatched.push({ id: r.id, source_key: k });
    }
  }

  // crawled items not in store (upstream items we don't sell)
  const notInStore = [...crawled].filter((k) => !dbKeys.has(k));

  // current product-category linkage shape (discover table)
  let linkage = null;
  try {
    const { rows } = await q(
      `SELECT count(*)::int c FROM product_categories`);
    linkage = { table: 'product_categories', rows: rows[0].c };
  } catch {}
  if (!linkage) {
    try {
      const { rows } = await q(
        `SELECT count(*)::int c FROM product_category`);
      linkage = { table: 'product_category', rows: rows[0].c };
    } catch (e) {
      linkage = { table: null, error: e.message };
    }
  }

  // categories columns
  const { rows: catCols } = await q(
    `SELECT column_name FROM information_schema.columns WHERE table_name='categories' ORDER BY ordinal_position`);

  const rootNames = new Map(tax.roots.map((r) => [r.id, r.name]));
  const byRootReport = [...byRoot.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rootId, n]) => ({ rootId, name: rootNames.get(rootId), products: n }));

  const report = {
    generatedAt: new Date().toISOString(),
    dbProductsTotal: allProd[0].c,
    mzakkaProducts: prodRows.length,
    currentCategories: catCount[0].c,
    newTaxonomyNodes: nodeName.size,
    matched,
    unmatched: unmatched.length,
    pctMatched: +((matched / prodRows.length) * 100).toFixed(2),
    matchedByDepth: byDepth,
    pctL2plus: +(((byDepth[2] + byDepth[3]) / matched) * 100).toFixed(1),
    crawledUpstreamItems: crawled.size,
    crawledButNotInStore: notInStore.length,
    linkage,
    categoryColumns: catCols.map((r) => r.column_name),
    byRoot: byRootReport,
    unmatchedSample: unmatched.slice(0, 50),
  };

  fs.writeFileSync(
    path.join(ROOT, 'tmp', 'category-remap-dryrun.json'),
    JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(ROOT, 'tmp', 'category-remap-unmatched.json'),
    JSON.stringify(unmatched, null, 1));

  console.log(JSON.stringify(report, null, 2));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
