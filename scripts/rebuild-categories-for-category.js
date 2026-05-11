require('dotenv').config();

const { Pool } = require('pg');
const crypto = require('node:crypto');
const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');

function parseArgs(argv) {
  const args = { categoryName: null, limit: 0, concurrency: 6, delayMs: 150, dryRun: false, progressEvery: 200 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--category-name') args.categoryName = String(argv[++i] || '').trim() || null;
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 150));
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--progress-every') args.progressEvery = Math.max(1, Number(argv[++i] || 200));
  }
  if (!args.categoryName) args.categoryName = '新商品・新規取扱商品';
  return args;
}

function makeCategorySlug(name) {
  const h = crypto.createHash('sha1').update(String(name || ''), 'utf8').digest('hex').slice(0, 16);
  return `mzakka-cat-${h}`;
}

function buildSelectTargetsSql({ categoryId, limit }) {
  const params = [Number(categoryId)];
  const limitSql = limit ? 'LIMIT $2' : '';
  if (limit) params.push(Number(limit));
  const sql = `
SELECT p.id as product_id, s.sku
FROM products p
JOIN product_skus s ON s.product_id = p.id
WHERE p.category_id = $1
ORDER BY p.id ASC
${limitSql}
  `.trim();
  return { sql, params };
}

async function fetchHtmlBySku(sku, { timeoutMs = 20000 } = {}) {
  const url = `https://mzakka.com/pc/detail/item.php?item_id=${encodeURIComponent(sku)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetries(fetchFn, { retries = 3, delayMs = 200 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (e) {
      lastError = e;
      if (attempt >= retries) break;
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function upsertCategory(client, name) {
  const slug = makeCategorySlug(name);
  const r = await client.query(
    `INSERT INTO categories (name, name_zh_hk, slug, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       name_zh_hk = EXCLUDED.name_zh_hk,
       status = 'active'
     RETURNING id`,
    [name, name, slug]
  );
  return Number(r.rows[0].id);
}

async function rebuildCategoriesForCategory({
  categoryName,
  limit = 0,
  concurrency = 6,
  delayMs = 150,
  dryRun = false,
  progressEvery = 200,
}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const categoryIdCache = new Map();

  const idResult = await pool.query(
    `SELECT id FROM categories WHERE COALESCE(name_zh_hk, name) = $1 LIMIT 1`,
    [categoryName]
  );
  if (!idResult.rows[0]) {
    await pool.end();
    throw new Error(`Category not found: ${categoryName}`);
  }
  const fromCategoryId = Number(idResult.rows[0].id);

  const { sql, params } = buildSelectTargetsSql({ categoryId: fromCategoryId, limit });
  const tasksResult = await pool.query(sql, params);
  const tasks = tasksResult.rows.map(r => ({ productId: Number(r.product_id), sku: String(r.sku) }));

  let processed = 0;
  let success = 0;
  let failed = 0;
  let categoriesUpserted = 0;
  let productsUpdated = 0;
  const total = tasks.length;
  const samples = [];

  async function upsertCategoryCached(client, name) {
    const cached = categoryIdCache.get(name);
    if (cached) return cached;
    const id = await upsertCategory(client, name);
    categoryIdCache.set(name, id);
    categoriesUpserted++;
    return id;
  }

  const start = Date.now();

  async function processOne(task, client) {
    const { productId, sku } = task;
    try {
      const html = await fetchWithRetries(() => fetchHtmlBySku(sku), { retries: 3, delayMs: 250 });
      const rootName = getRootCategoryNameFromHtml(html) || '未分類';

      if (samples.length < 5) samples.push({ sku, rootCategoryName: rootName });

      if (!dryRun) {
        await client.query('BEGIN');
        const categoryId = await upsertCategoryCached(client, rootName);
        await client.query('UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = $2', [categoryId, productId]);
        await client.query('COMMIT');
        productsUpdated++;
      }

      success++;
    } catch (e) {
      try {
        if (!dryRun) await client.query('ROLLBACK');
      } catch (_) {}
      failed++;
    } finally {
      processed++;
      if (progressEvery && processed % progressEvery === 0) {
        const elapsedMs = Date.now() - start;
        const ratePerMin = elapsedMs > 0 ? Math.round((processed / elapsedMs) * 60000) : 0;
        const remaining = total - processed;
        console.log(JSON.stringify({ progress: { processed, total, remaining, success, failed, categoriesUpserted, productsUpdated, ratePerMin } }));
      }
    }
  }

  async function worker() {
    const c = await pool.connect();
    try {
      while (tasks.length > 0) {
        const t = tasks.shift();
        if (!t) break;
        await processOne(t, c);
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      }
    } finally {
      c.release();
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  const elapsedMs = Date.now() - start;

  await pool.end();

  return {
    categoryName,
    fromCategoryId,
    dryRun,
    processed,
    success,
    failed,
    categoriesUpserted,
    productsUpdated,
    elapsedMs,
    samples,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const out = await rebuildCategoriesForCategory(args);
  console.log(JSON.stringify({ ok: true, mode: args.dryRun ? 'dry-run' : 'rebuild', ...out }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, buildSelectTargetsSql, rebuildCategoriesForCategory };

