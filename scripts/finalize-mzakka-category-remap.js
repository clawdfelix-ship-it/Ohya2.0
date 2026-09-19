#!/usr/bin/env node
'use strict';

/**
 * finalize-mzakka-category-remap.js
 *
 * Applies the clean 257-node taxonomy + product remap to the store DB.
 *
 * Modes:
 *   --dry-run   report only, no writes (default)
 *   --apply     execute: backups -> insert 257 cats -> remap products -> hide old cats
 *
 * Backups created (idempotent):
 *   categories_backup_20260919
 *   products_category_backup_20260919
 *
 * The 12 products whose upstream item pages are dead are assigned by the
 * root name stored in raw_payload.category; they are flagged for review.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const dbUrl = (process.env.DATABASE_URL || '').trim() || fs.readFileSync('/tmp/.ohya_db_url','utf8').trim();

// root name (as it appears in raw_payload.category after promo prefix) -> id
const ROOT_BY_NAME = new Map([
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
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = (s, p = []) => pool.query(s, p);

  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), 'utf8'));
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'item-leaf-map-resolved.json'), 'utf8'));

  // flatten taxonomy depth-ordered
  const flat = [];
  const walk = (n, depth, parentMId) => {
    flat.push({ id: n.id, name: n.name, depth, parentMId });
    (n.children || []).forEach((c) => walk(c, depth + 1, n.id));
  };
  tax.roots.forEach((r) => walk(r, 1, null));

  // products + raw_payload root fallback
  const { rows: products } = await q(
    `SELECT id, source_key, category_id AS old_cat, raw_payload->>'category' AS rp_cat
     FROM products WHERE source='mzakka'`);

  const assigns = []; // {productId, mId, via}
  const review = [];
  for (const p of products) {
    const key = String(p.source_key).trim();
    const m = map.items[key];
    if (m && m.canonical) {
      assigns.push({ productId: p.id, mId: m.canonical, via: m.arbitrated === 'breadcrumb' ? 'breadcrumb' : 'listing' });
    } else {
      // dead upstream page: root from raw_payload text
      let s = String(p.rp_cat || '').replace(/^アダルトグッズ実演販売\s*>\s*/, '');
      let rootId = null;
      for (const [name, id] of ROOT_BY_NAME) {
        if (s.startsWith(name)) { rootId = id; break; }
      }
      if (!rootId) { review.push({ productId: p.id, source_key: key, reason: 'no-root-match' }); continue; }
      assigns.push({ productId: p.id, mId: rootId, via: 'rawpayload-root' });
      review.push({ productId: p.id, source_key: key, reason: 'upstream-dead-root-only', mId: rootId });
    }
  }

  // stats
  const nodeName = new Map(flat.map((n) => [n.id, n]));
  const byDepth = { 1: 0, 2: 0, 3: 0 };
  const byVia = {};
  for (const a of assigns) {
    byDepth[nodeName.get(a.mId).depth]++;
    byVia[a.via] = (byVia[a.via] || 0) + 1;
  }

  console.log(`products=${products.length} assigned=${assigns.length} review=${review.length}`);
  console.log('by depth:', byDepth);
  console.log('by via:', byVia);

  if (!APPLY) {
    fs.writeFileSync(path.join(ROOT, 'tmp', 'final-assignments.json'),
      JSON.stringify({ assigns, review }, null, 1));
    console.log('DRY RUN — wrote tmp/final-assignments.json');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. backups
    await client.query(`CREATE TABLE IF NOT EXISTS categories_backup_20260919 AS TABLE categories`);
    await client.query(`CREATE TABLE IF NOT EXISTS products_category_backup_20260919
                        AS SELECT id, category_id, now() AS backed_up_at FROM products`);

    // 2. insert 257 categories (parents first; flat is already preorder depth-sorted)
    const mIdToDbId = new Map();
    for (const n of flat) {
      const parentDbId = n.parentMId != null ? mIdToDbId.get(n.parentMId) : null;
      const slug = `mzakka-cat-real-${n.id}`;
      const { rows } = await client.query(
        `INSERT INTO categories
           (name, name_zh_hk, slug, parent_id, sort_order, status, source, source_key, created_at, updated_at)
         VALUES ($1,$1,$2,$3,$4,'active','mzakka',$5,now(),now())
         ON CONFLICT (source, source_key)
           WHERE source IS NOT NULL AND source_key IS NOT NULL
         DO UPDATE SET updated_at=now()
         RETURNING id`,
        [n.name, slug, parentDbId, n.id, String(n.id)]);
      mIdToDbId.set(n.id, rows[0].id);
    }

    // 3. remap products via temp table batched
    await client.query(`CREATE TEMP TABLE tmp_remap(product_id int PRIMARY KEY, new_cat int, via text) ON COMMIT DROP`);
    const vals = [];
    const params = [];
    assigns.forEach((a, i) => {
      params.push(a.productId, mIdToDbId.get(a.mId), a.via);
      vals.push(`($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`);
    });
    await client.query(`INSERT INTO tmp_remap(product_id,new_cat,via) VALUES ${vals.join(',')}`, params);
    const upd = await client.query(
      `UPDATE products p SET category_id=t.new_cat, updated_at=now()
       FROM tmp_remap t WHERE p.id=t.product_id`);
    console.log('products updated:', upd.rowCount);

    // 4. hide every OLD category (anything not one of the 257 new rows)
    const newDbIds = [...mIdToDbId.values()];
    const hid = await client.query(
      `UPDATE categories SET status='hidden', updated_at=now()
       WHERE id <> ALL($1::int[])`, [newDbIds]);
    console.log('old categories hidden:', hid.rowCount);

    // post-checks inside txn
    const { rows: activeCats } = await client.query(`SELECT count(*)::int c FROM categories WHERE status='active'`);
    const { rows: badFk } = await client.query(
      `SELECT count(*)::int c FROM products p LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.source='mzakka' AND (c.id IS NULL OR c.status<>'active')`);
    console.log('active categories now:', activeCats[0].c, '| products not under active cat:', badFk[0].c);
    if (activeCats[0].c !== 257 || badFk[0].c !== 0) throw new Error('post-check failed — rollback');

    await client.query('COMMIT');
    console.log('COMMITTED ✅');
    fs.writeFileSync(path.join(ROOT, 'tmp', 'remap-review-queue.json'), JSON.stringify(review, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
