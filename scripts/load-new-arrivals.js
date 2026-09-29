#!/usr/bin/env node
'use strict';
/**
 * load-new-arrivals.js
 *
 * 讀 data/new-arrivals.json（mzakka 新商品節點 1789 文檔次序），
 * 經 products.slug（mzakka-<item 小寫>）對 product id，寫入 new_arrival_rank：
 *   product_id PK, rank（1 = mzakka 新商品區最前）。
 * app.js 嘅 storefront-new 改 join 呢個表，取代「最新匯入 id DESC」。
 *
 * Usage: DATABASE_URL=... node scripts/load-new-arrivals.js [--apply]
 */
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const JSON_FILE = path.join(ROOT, 'data', 'new-arrivals.json');
const dbUrl = (process.env.DATABASE_URL || '').trim() ||
  fs.readFileSync('/tmp/.ohya_db_url', 'utf8').trim();
const useSsl = /sslmode=(require|verify-ca|verify-full)/i.test(dbUrl);

const DDL = `
CREATE TABLE IF NOT EXISTS new_arrival_rank (
  product_id integer PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  rank integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_new_arrival_rank_rank ON new_arrival_rank(rank);
`;

(async () => {
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const items = data.items || [];

  const pool = new Pool({ connectionString: dbUrl, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 2 });
  const q = (s, p = []) => pool.query(s, p);

  const { rows: prods } = await q(`SELECT id, slug FROM products`);
  const pidByItem = new Map();
  prods.forEach(p => {
    const m = /^mzakka-(.+)$/.exec(p.slug);
    if (m) pidByItem.set(m[1].toLowerCase(), p.id);
  });

  const rows = [];
  let skipped = 0;
  items.forEach((item, i) => {
    const pid = pidByItem.get(String(item).toLowerCase());
    if (pid == null) { skipped++; return; }
    rows.push([pid, i + 1]);
  });

  console.log(`json items=${items.length}, mapped rows=${rows.length}, skipped unknown=${skipped}`);
  console.log('generatedAt:', data.generatedAt);
  if (!APPLY) { console.log('DRY RUN — pass --apply'); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(DDL);
    await client.query('TRUNCATE new_arrival_rank');
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const vals = [], params = [];
      slice.forEach((r, j) => {
        params.push(r[0], r[1]);
        vals.push(`($${j * 2 + 1},$${j * 2 + 2})`);
      });
      await client.query(
        `INSERT INTO new_arrival_rank(product_id,rank) VALUES ${vals.join(',')}`,
        params);
    }
    const { rows: c } = await client.query(`SELECT count(*)::int n FROM new_arrival_rank`);
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
