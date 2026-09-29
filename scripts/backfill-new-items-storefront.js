#!/usr/bin/env node
'use strict';
/**
 * backfill-new-items-storefront.js
 *
 * 新 import 嘅 596 件因 loadDbNodeMap 同本機 schema 唔夾（mirror 冇 numeric
 * source_key）而 category_id 留空、冇入 product_storefront。呢度：
 *  1. resolveItemNode(item) -> 新 mzakka root node
 *  2. 新 root -> 舊鏡像 top id（curated）-> storefront_category_id（經 map）
 *  3. UPDATE products.category_id（鏡像 top id）+ UPSERT product_storefront
 *
 * Usage: DATABASE_URL=... node scripts/backfill-new-items-storefront.js [--apply]
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { resolveItemNode } = require('../utils/mzakkaCategoryResolver');

const ROOT = path.join(__dirname, '..');

// 直接喺 taxonomy 建 leaf -> root（最穩陣，唔使逐個列葉）
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
const ROOT_OF = new Map();
tax.roots.forEach(r => {
  (function walk(n){
    ROOT_OF.set(n.id, r.id);
    (n.children||[]).forEach(walk);
  })(r);
});

const APPLY = process.argv.includes('--apply');
const JSONL = path.join(ROOT, 'tmp', 'new-import', 'new-items-p1-3.jsonl');
const dbUrl = (process.env.DATABASE_URL || '').trim() ||
  fs.readFileSync('/tmp/.ohya_db_url', 'utf8').trim();
const useSsl = /sslmode=(require|verify-ca|verify-full)/i.test(dbUrl);

// 新 mzakka root node -> 舊鏡像 top id（同 storefront_category_map 對齊）
const ROOT_TO_MIRROR_TOP = {
  1792: 14, // 潤滑
  1801: 13, // 飛機杯
  1808: 18, // 娃娃
  1811: 11, // 震動棒（仿真 12 為近似，主力歸震動棒）
  1820: 11, // ローター 歸震動棒
  1826: 22, // 避孕套
  1831: 17, // 後庭
  1837: 16, // 配件雜貨
  1841: 19, // SM
  1851: 21, // 護理保健
  1852: 15, // 情趣內衣
  1861: 16, // 書籍雜貨
  1865: null, // 業務用：冇對應 storefront
};

(async () => {
  const items = fs.readFileSync(JSONL, 'utf8').trim().split('\n').map(JSON.parse);
  const pool = new Pool({ connectionString: dbUrl, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 2 });
  const q = (s, p = []) => pool.query(s, p);

  // slug -> pid
  const { rows: prods } = await q(`SELECT id, slug FROM products`);
  const pidBySlug = new Map(prods.map(p => [p.slug.toLowerCase(), p.id]));

  // mirror top -> storefront cat
  const { rows: mapRows } = await q(`SELECT mzakka_top_id, storefront_category_id FROM storefront_category_map`);
  const sfByTop = new Map(mapRows.map(r => [Number(r.mzakka_top_id), Number(r.storefront_category_id)]));

  const plan = [];
  let noRoot = 0, noSf = 0, missingPid = 0;
  for (const item of items) {
    const slug = ('mzakka-' + String(item.id).toLowerCase());
    const pid = pidBySlug.get(slug);
    if (pid == null) { missingPid++; continue; }
    const { nodeId } = resolveItemNode(item);
    const rootNode = nodeId == null ? null : ROOT_OF.get(nodeId);
    const topId = ROOT_TO_MIRROR_TOP[rootNode];
    if (rootNode == null || topId == null) { noRoot++; continue; }
    const sfId = sfByTop.get(topId);
    if (sfId == null) { noSf++; continue; }
    plan.push({ pid, topId, sfId });
  }

  const bySf = {};
  plan.forEach(p => { bySf[p.sfId] = (bySf[p.sfId] || 0) + 1; });
  console.log(`planned=${plan.length}, noRoot/noSf=${noRoot}, missingPid=${missingPid}`);
  console.log('by storefront cat:', bySf);
  if (!APPLY) { console.log('DRY RUN — --apply'); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of plan) {
      await client.query(`UPDATE products SET category_id=$1, updated_at=NOW() WHERE id=$2`, [p.topId, p.pid]);
      await client.query(
        `INSERT INTO product_storefront(product_id, storefront_category_id)
         SELECT $1,$2
         WHERE NOT EXISTS (
           SELECT 1 FROM product_storefront
           WHERE product_id=$1 AND storefront_category_id=$2)`,
        [p.pid, p.sfId]);
    }
    await client.query('COMMIT');
    console.log('COMMITTED ✅');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
