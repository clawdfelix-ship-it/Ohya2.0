#!/usr/bin/env node
'use strict';
/**
 * load-mzakka-ranks-mirror-top.js
 *
 * 本機 schema 同 scripts/load-mzakka-category-ranks.js 嘅假設唔同：
 *  - products 冇 source/source_key，mzakka id 喺 slug（mzakka-<id 小寫>）
 *  - rank JSON 用新節點 id（1792…），但本地 categories 只保留舊鏡像 top id（11…22）
 *
 * 所以呢度用「分類名」做橋：新 root node -> 名 -> 舊鏡像 top id，
 * 再將每個 root 嘅 item 次序（含整個子樹）寫入 mzakka_category_rank，
 * category_id 用舊鏡像 top id（FK 先過）。app.js 用 storefront_category_map
 * 嘅 mzakka_top_id join。
 *
 * Usage: DATABASE_URL=... node scripts/load-mzakka-ranks-mirror-top.js [--apply]
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const dbUrl = (process.env.DATABASE_URL || '').trim() ||
  fs.readFileSync('/tmp/.ohya_db_url', 'utf8').trim();
const useSsl = /sslmode=(require|verify-ca|verify-full)/i.test(dbUrl);

// 分類名 -> 新 root node（同 finalize-mzakka-category-remap.js 一致）
const NAME_TO_NEWROOT = new Map([
  ['ローション・クリーナー', 1792],
  ['オナホール・おっぱい', 1801],
  ['ダッチ・抱き枕・ドール', 1808],
  ['バイブ・電マ・ディルド', 1811],
  ['ローター・クリ,乳首責め', 1820],
  ['コンドーム', 1826],
  ['アナル', 1831],
  ['サポートグッズ', 1837],
  ['SM・拘束具', 1841],
  ['ラブサプリ,コスメ,匂い', 1851],
  ['コスチューム', 1852],
  ['書籍・雑貨', 1861],
  ['業務用', 1865],
]);

(async () => {
  const pool = new Pool({ connectionString: dbUrl, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 2 });
  const q = (s, p = []) => pool.query(s, p);

  const ranks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mzakka-category-ranks.json'), 'utf8')).ranks;

  // 舊鏡像 top: name -> id
  const { rows: mirror } = await q(
    `SELECT id, name FROM categories WHERE source='mzakka_mirror'`);
  const topIdByName = new Map(mirror.map(r => [String(r.name).trim(), r.id]));

  // 新 root -> 舊 top id
  const rootToTop = new Map();
  for (const [name, newRoot] of NAME_TO_NEWROOT) {
    const topId = topIdByName.get(name);
    if (topId != null) rootToTop.set(newRoot, topId);
  }

  // slug (mzakka-<id>) -> product id
  const { rows: prods } = await q(`SELECT id, slug FROM products`);
  const pidByItem = new Map();
  prods.forEach(p => {
    const m = /^mzakka-(.+)$/.exec(p.slug);
    if (m) pidByItem.set(m[1].toLowerCase(), p.id);
  });

  const rows = [];
  let skippedItem = 0;
  for (const [newRootStr, items] of Object.entries(ranks)) {
    const topId = rootToTop.get(Number(newRootStr));
    if (topId == null) continue; // 子節點 / 業務用（冇鏡像）
    items.forEach((item, i) => {
      const pid = pidByItem.get(String(item).toLowerCase());
      if (pid == null) { skippedItem++; return; }
      rows.push([topId, pid, i + 1]);
    });
  }

  const covered = new Set(rows.map(r => r[1]));
  console.log(`rank rows=${rows.length}, top cats=${new Set(rows.map(r => r[0])).size}, products=${covered.size}, skipped unknown item=${skippedItem}`);
  if (!APPLY) { console.log('DRY RUN — pass --apply'); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '2026-09-20-mzakka-category-rank.sql'), 'utf8');
    await client.query(sql);
    await client.query('TRUNCATE mzakka_category_rank');
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const vals = [], params = [];
      slice.forEach((r, j) => {
        params.push(r[0], r[1], r[2]);
        vals.push(`($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`);
      });
      await client.query(
        `INSERT INTO mzakka_category_rank(category_id,product_id,rank) VALUES ${vals.join(',')}`,
        params);
    }
    const { rows: c } = await client.query(
      `SELECT count(*)::int n, count(distinct category_id)::int cats FROM mzakka_category_rank`);
    console.log('loaded:', c[0]);
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
})().catch(e => { console.error(e); process.exit(1); });
