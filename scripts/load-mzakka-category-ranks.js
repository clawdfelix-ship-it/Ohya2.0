#!/usr/bin/env node
'use strict';

/**
 * load-mzakka-category-ranks.js
 *
 * Applies migrations/2026-09-20-mzakka-category-rank.sql and fills
 * mzakka_category_rank from data/mzakka-category-ranks.json (mzakka 標準 order).
 *
 * Only products actually in the store and only the 257 active real categories
 * are loaded. Idempotent (full replace inside a transaction).
 *
 * DATABASE_URL env, or /tmp/.ohya_db_url fallback.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const dbUrl = (process.env.DATABASE_URL || '').trim() ||
  fs.readFileSync('/tmp/.ohya_db_url', 'utf8').trim();

(async () => {
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = (s, p = []) => pool.query(s, p);

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mzakka-category-ranks.json'), 'utf8'));

  // maps
  const { rows: prods } = await q(
    `SELECT id, source_key FROM products WHERE source='mzakka'`);
  const productByKey = new Map(prods.map((r) => [String(r.source_key).trim(), r.id]));

  const { rows: cats } = await q(
    `SELECT id, source_key FROM categories
     WHERE source='mzakka' AND status='active' AND source_key ~ '^[0-9]+$'`);
  const catByNode = new Map(cats.map((r) => [Number(r.source_key), r.id]));

  const rows = [];
  let skippedNode = 0;
  let skippedProduct = 0;
  for (const [nodeStr, itemIds] of Object.entries(data.ranks)) {
    const catId = catByNode.get(Number(nodeStr));
    if (catId == null) { skippedNode++; continue; }
    itemIds.forEach((itemId, i) => {
      const productId = productByKey.get(String(itemId));
      if (productId == null) { skippedProduct++; return; }
      rows.push([catId, productId, i + 1]);
    });
  }

  console.log(`rank rows to load=${rows.length} (skipped unknown node=${skippedNode}, unknown/non-store product refs=${skippedProduct})`);

  if (!APPLY) {
    // coverage summary
    const covered = new Set(rows.map((r) => r[1]));
    console.log(`distinct store products with a rank=${covered.size}/${prods.length}`);
    console.log('DRY RUN — pass --apply to write');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '2026-09-20-mzakka-category-rank.sql'), 'utf8');
    await client.query(sql);
    await client.query('TRUNCATE mzakka_category_rank');

    // bulk insert in chunks
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const vals = [];
      const params = [];
      slice.forEach((r, j) => {
        params.push(r[0], r[1], r[2]);
        vals.push(`($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`);
      });
      await client.query(
        `INSERT INTO mzakka_category_rank(category_id,product_id,rank) VALUES ${vals.join(',')}`,
        params);
    }

    const { rows: cnt } = await client.query('SELECT count(*)::int c, count(DISTINCT product_id)::int p, count(DISTINCT category_id)::int n FROM mzakka_category_rank');
    console.log('loaded:', cnt[0]);
    await client.query('COMMIT');
    console.log('COMMITTED ✅');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
