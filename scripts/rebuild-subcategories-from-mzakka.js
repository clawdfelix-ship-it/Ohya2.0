require('dotenv').config();

const crypto = require('node:crypto');
const { Pool } = require('pg');

function parseArgs(argv) {
  const args = { limit: 0, concurrency: 6, delayMs: 150, dryRun: false, sku: null, progressEvery: 200, onlyOther: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 150));
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sku') args.sku = String(argv[++i] || '').trim() || null;
    else if (a === '--progress-every') args.progressEvery = Math.max(1, Number(argv[++i] || 200));
    else if (a === '--only-other') args.onlyOther = true;
  }
  return args;
}

function makeCategorySlug(name) {
  const h = crypto.createHash('sha1').update(String(name || ''), 'utf8').digest('hex').slice(0, 16);
  return `mzakka-cat-${h}`;
}

function makeSubcategorySlug(rootName, subName) {
  const h = crypto
    .createHash('sha1')
    .update(`${String(rootName || '')}///${String(subName || '')}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `mzakka-subcat-${h}`;
}

function isPseudoCategory(name) {
  if (!name) return true;
  const s = String(name);
  if (s.includes('新商品')) return true;
  if (s.includes('新規取扱')) return true;
  if (s.includes('注目商品')) return true;
  if (s.includes('ランキング')) return true;
  if (s.includes('上半期')) return true;
  if (s.includes('下半期')) return true;
  if (s.includes('年')) return true;
  return false;
}

function extractBreadcrumbHtmlBlock(html) {
  if (typeof html !== 'string' || !html) return null;
  const m = html.match(/<div[^>]*id=\"breadcrumb\"[^>]*>([\s\S]*?)<\/div>/i);
  return m ? m[1] : null;
}

function extractCategoryPathsFromBreadcrumb(html) {
  const block = extractBreadcrumbHtmlBlock(html);
  if (!block) return [];

  const lines = block.split(/<br\s*\/?>/i);
  const paths = [];
  for (const line of lines) {
    const names = [...line.matchAll(/category\.php\?category=\d+[^>]*>([^<]+)</ig)]
      .map(x => String(x[1] || '').trim())
      .filter(Boolean);
    if (names.length) paths.push(names);
  }
  return paths;
}

function normalizePath(names) {
  const out = [];
  for (const n of names || []) {
    const t = String(n || '').trim();
    if (!t) continue;
    if (isPseudoCategory(t)) continue;
    if (t === out[out.length - 1]) continue;
    out.push(t);
  }
  const markerIndex = out.indexOf('メーカー別');
  return markerIndex >= 0 ? out.slice(0, markerIndex) : out;
}

function isBadRootCategory(name) {
  if (!name) return true;
  const s = String(name);
  if (s.includes('セール')) return true;
  if (s.includes('OFF')) return true;
  if (s.includes('%')) return true;
  if (s.includes('限定')) return true;
  if (s.includes('キャンペーン')) return true;
  if (s.includes('プレゼント')) return true;
  if (s.includes('わけあり')) return true;
  if (s.includes('売上')) return true;
  if (s.includes('ベスト')) return true;
  if (s.includes('タイムセール')) return true;
  return false;
}

function pickPrimaryPath(paths, { allowedRoots } = {}) {
  const normalized = (paths || [])
    .map(p => normalizePath(p))
    .filter(p => p.length > 0);

  const candidates = normalized.filter(p => p[0] !== 'メーカー別');
  if (!candidates.length) return null;

  const allowed = allowedRoots instanceof Set ? allowedRoots : null;
  const preferred = candidates.filter(p => {
    const root = p[0];
    if (root === 'メーカー別') return false;
    if (isBadRootCategory(root)) return false;
    if (allowed && !allowed.has(root)) return false;
    return true;
  });
  const pool = preferred.length ? preferred : candidates;

  let best = pool[0];
  for (const p of pool.slice(1)) {
    if (p.length > best.length) best = p;
  }
  return best;
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

async function fetchWithRetries(fetchFn, { retries = 3, delayMs = 250 } = {}) {
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

async function upsertRootCategory(client, rootName, cache) {
  const cached = cache.get(`root:${rootName}`);
  if (cached) return cached;
  const slug = makeCategorySlug(rootName);
  const r = await client.query(
    `INSERT INTO categories (name, name_zh_hk, slug, status, parent_id)
     VALUES ($1, $2, $3, 'active', NULL)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       name_zh_hk = EXCLUDED.name_zh_hk,
       status = 'active',
       parent_id = NULL
     RETURNING id`,
    [rootName, rootName, slug]
  );
  const id = Number(r.rows[0].id);
  cache.set(`root:${rootName}`, id);
  cache.set(`slug:${slug}`, id);
  return id;
}

async function upsertSubcategory(client, rootName, rootId, subName, cache) {
  const key = `sub:${rootName}///${subName}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let slug = null;
  if (subName === '其他') {
    const rootSlug = makeCategorySlug(rootName);
    slug = `${rootSlug}-other`;
  } else {
    slug = makeSubcategorySlug(rootName, subName);
  }

  const r = await client.query(
    `INSERT INTO categories (name, name_zh_hk, slug, status, parent_id)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       name_zh_hk = EXCLUDED.name_zh_hk,
       status = 'active',
       parent_id = EXCLUDED.parent_id
     RETURNING id`,
    [subName, subName, slug, rootId]
  );
  const id = Number(r.rows[0].id);
  cache.set(key, id);
  cache.set(`slug:${slug}`, id);
  return id;
}

async function rebuildSubcategoriesFromMzakka({ limit = 0, concurrency = 6, delayMs = 150, progressEvery = 200, onlyOther = false } = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const cache = new Map();
  const start = Date.now();

  let tasks = [];
  let allowedRoots = null;
  const client = await pool.connect();
  try {
    const limitSql = limit ? `LIMIT ${Number(limit)}` : '';
    const roots = await client.query(
      `SELECT COALESCE(name_zh_hk, name) as name
       FROM categories
       WHERE parent_id IS NULL AND status = 'active'
       LIMIT 2000`
    );
    allowedRoots = new Set((roots.rows || []).map(r => String(r.name || '').trim()).filter(Boolean));

    const where = onlyOther ? `WHERE p.category_id IN (SELECT id FROM categories WHERE slug LIKE '%-other')` : '';
    const r = await client.query(
      `SELECT p.id as product_id, s.sku
       FROM products p
       JOIN product_skus s ON s.product_id = p.id
       ${where}
       ORDER BY p.id ASC
       ${limitSql}`
    );
    tasks = r.rows.map(x => ({ productId: Number(x.product_id), sku: String(x.sku) }));
  } finally {
    client.release();
  }

  let processed = 0;
  let success = 0;
  let failed = 0;
  let productsUpdated = 0;

  async function processOne(task, dbClient) {
    const { productId, sku } = task;
    const html = await fetchWithRetries(() => fetchHtmlBySku(sku), { retries: 3, delayMs: 250 });
    const paths = extractCategoryPathsFromBreadcrumb(html);
    const primary = pickPrimaryPath(paths, { allowedRoots });
    const rootName = (primary && primary[0]) ? primary[0] : '未分類';
    const subName = (primary && primary.length >= 2) ? primary[primary.length - 1] : '其他';

    await dbClient.query('BEGIN');
    try {
      const rootKey = `root:${rootName}`;
      const subKey = `sub:${rootName}///${subName}`;
      const rootWasCached = cache.has(rootKey);
      const subWasCached = cache.has(subKey);

      const rootId = await upsertRootCategory(dbClient, rootName, cache);
      const leafId = await upsertSubcategory(dbClient, rootName, rootId, subName, cache);

      await dbClient.query('UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = $2', [leafId, productId]);
      await dbClient.query('COMMIT');
      productsUpdated++;
      success++;

      if (!rootWasCached) cache.set('__stats:rootUpserts', (cache.get('__stats:rootUpserts') || 0) + 1);
      if (!subWasCached) cache.set('__stats:subUpserts', (cache.get('__stats:subUpserts') || 0) + 1);
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    }
  }

  async function worker() {
    const c = await pool.connect();
    try {
      while (tasks.length > 0) {
        const t = tasks.shift();
        if (!t) break;
        try {
          await processOne(t, c);
        } catch (_) {
          failed++;
        } finally {
          processed++;
          if (progressEvery && processed % progressEvery === 0) {
            const elapsedMs = Date.now() - start;
            const ratePerMin = elapsedMs > 0 ? Math.round((processed / elapsedMs) * 60000) : 0;
            const remaining = tasks.length;
            console.log(JSON.stringify({ progress: { processed, remaining, success, failed, productsUpdated, ratePerMin } }));
          }
        }
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      }
    } finally {
      c.release();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  const elapsedMs = Date.now() - start;
  const rootUpserts = Number(cache.get('__stats:rootUpserts') || 0);
  const subUpserts = Number(cache.get('__stats:subUpserts') || 0);
  await pool.end();
  return { processed, success, failed, productsUpdated, rootUpserts, subUpserts, elapsedMs };
}

async function dryRunSample({ sku }) {
  const html = await fetchHtmlBySku(sku);
  const paths = extractCategoryPathsFromBreadcrumb(html).map(p => normalizePath(p));
  const primary = pickPrimaryPath(paths);
  return { sku, paths, primary, root: primary && primary[0], leaf: primary && primary[primary.length - 1] };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.dryRun) {
    const sku = args.sku || '00T096';
    const r = await dryRunSample({ sku });
    console.log(JSON.stringify({ ok: true, mode: 'dry-run', ...r }, null, 2));
    return;
  }

  const r = await rebuildSubcategoriesFromMzakka({
    limit: args.limit,
    concurrency: args.concurrency,
    delayMs: args.delayMs,
    progressEvery: args.progressEvery,
    onlyOther: args.onlyOther,
  });
  console.log(JSON.stringify({ ok: true, mode: 'rebuild', ...r }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = {
  extractCategoryPathsFromBreadcrumb,
  normalizePath,
  pickPrimaryPath,
  dryRunSample,
  rebuildSubcategoriesFromMzakka,
};
