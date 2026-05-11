require('dotenv').config();

const crypto = require('node:crypto');
const { Pool } = require('pg');
const { getRootCategoryNameFromHtml } = require('../utils/mzakkaBreadcrumb');

function parseArgs(argv) {
  const args = { limit: 0, concurrency: 6, delayMs: 150, rebuildAll: false, dryRun: false, sku: null, progressEvery: 200 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 150));
    else if (a === '--rebuild-all') args.rebuildAll = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sku') args.sku = String(argv[++i] || '').trim() || null;
    else if (a === '--progress-every') args.progressEvery = Math.max(1, Number(argv[++i] || 200));
  }
  return args;
}

function makeCategorySlug(name) {
  const h = crypto.createHash('sha1').update(String(name || ''), 'utf8').digest('hex').slice(0, 16);
  return `mzakka-cat-${h}`;
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

async function dryRunSample({ sku }, { fetchHtml } = {}) {
  const html = await (fetchHtml ? fetchHtml(sku) : fetchHtmlBySku(sku));
  const rootCategoryName = getRootCategoryNameFromHtml(html);
  return { sku, rootCategoryName };
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

async function rebuildCategoriesFromMzakka({
  limit = 0,
  concurrency = 6,
  delayMs = 150,
  rebuildAll = false,
  progressEvery = 200,
}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const categoryIdCache = new Map();

  const client = await pool.connect();
  let tasks = [];
  try {
    const where = rebuildAll ? '' : 'WHERE p.category_id IS NULL OR p.category_id IN (1,3)';
    const limitSql = limit ? `LIMIT ${Number(limit)}` : '';
    const result = await client.query(
      `SELECT p.id as product_id, s.sku
       FROM products p
       JOIN product_skus s ON s.product_id = p.id
       ${where}
       ORDER BY p.id ASC
       ${limitSql}`
    );
    tasks = result.rows.map(r => ({ productId: Number(r.product_id), sku: String(r.sku) }));
  } finally {
    client.release();
  }

  let processed = 0;
  let success = 0;
  let failed = 0;
  let categoriesUpserted = 0;
  let productsUpdated = 0;
  const total = tasks.length;

  async function upsertCategory(client2, name) {
    const cached = categoryIdCache.get(name);
    if (cached) return cached;
    const slug = makeCategorySlug(name);
    const r = await client2.query(
      `INSERT INTO categories (name, name_zh_hk, slug, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         name_zh_hk = EXCLUDED.name_zh_hk,
         status = 'active'
       RETURNING id`,
      [name, name, slug]
    );
    categoriesUpserted++;
    const id = Number(r.rows[0].id);
    categoryIdCache.set(name, id);
    return id;
  }

  async function processOne(task, dbClient) {
    const { productId, sku } = task;
    try {
      const html = await fetchWithRetries(() => fetchHtmlBySku(sku), { retries: 3, delayMs: 250 });
      const rootName = getRootCategoryNameFromHtml(html) || '未分類';

      await dbClient.query('BEGIN');
      const categoryId = await upsertCategory(dbClient, rootName);
      await dbClient.query('UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = $2', [categoryId, productId]);
      await dbClient.query('COMMIT');

      productsUpdated++;
      success++;
    } catch (e) {
      try {
        await dbClient.query('ROLLBACK');
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

  const start = Date.now();
  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  const elapsedMs = Date.now() - start;

  await pool.end();

  return {
    processed,
    success,
    failed,
    categoriesUpserted,
    productsUpdated,
    elapsedMs,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.dryRun) {
    const sku = args.sku || '00T096';
    const r = await dryRunSample({ sku });
    console.log(JSON.stringify({ ok: true, mode: 'dry-run', ...r }, null, 2));
    return;
  }

  const r = await rebuildCategoriesFromMzakka({
    limit: args.limit,
    concurrency: args.concurrency,
    delayMs: args.delayMs,
    rebuildAll: args.rebuildAll,
    progressEvery: args.progressEvery,
  });
  console.log(JSON.stringify({ ok: true, mode: 'rebuild', ...r }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, dryRunSample, rebuildCategoriesFromMzakka };
