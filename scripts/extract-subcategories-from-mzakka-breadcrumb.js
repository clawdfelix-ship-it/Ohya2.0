require('dotenv').config();

const fs = require('node:fs');
const { Pool } = require('pg');
const { extractBreadcrumbCategoryNames } = require('../utils/mzakkaBreadcrumb');

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

function parseArgs(argv) {
  const args = {
    limit: 0,
    concurrency: 6,
    delayMs: 150,
    out: null,
    progressEvery: 200,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 6));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 150));
    else if (a === '--out') args.out = String(argv[++i] || '').trim() || null;
    else if (a === '--progress-every') args.progressEvery = Math.max(1, Number(argv[++i] || 200));
  }
  return args;
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

async function extractSubcategories({ limit = 0, concurrency = 6, delayMs = 150, progressEvery = 200 } = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  let tasks = [];
  try {
    const limitSql = limit ? `LIMIT ${Number(limit)}` : '';
    const r = await pool.query(
      `SELECT DISTINCT s.sku
       FROM product_skus s
       ORDER BY s.sku ASC
       ${limitSql}`
    );
    tasks = r.rows.map(x => String(x.sku));
  } finally {
    await pool.end();
  }

  const rootToSubSet = new Map();
  const rootSubCount = new Map();
  const subSet = new Set();
  let processed = 0;
  let success = 0;
  let failed = 0;
  const start = Date.now();

  async function processOne(sku) {
    const html = await fetchWithRetries(() => fetchHtmlBySku(sku), { retries: 3, delayMs: 250 });
    const names = extractBreadcrumbCategoryNames(html);
    const path = normalizePath(names);
    const root = path[0] || '未分類';
    const subs = [...new Set(path.slice(1))];
    for (const s of subs) {
      subSet.add(s);
      const set = rootToSubSet.get(root) || new Set();
      set.add(s);
      rootToSubSet.set(root, set);
      const k = `${root}///${s}`;
      rootSubCount.set(k, (rootSubCount.get(k) || 0) + 1);
    }
  }

  async function worker() {
    while (tasks.length > 0) {
      const sku = tasks.shift();
      if (!sku) break;
      try {
        await processOne(sku);
        success++;
      } catch (_) {
        failed++;
      } finally {
        processed++;
        if (progressEvery && processed % progressEvery === 0) {
          const elapsedMs = Date.now() - start;
          const ratePerMin = elapsedMs > 0 ? Math.round((processed / elapsedMs) * 60000) : 0;
          const remaining = tasks.length;
          process.stdout.write(JSON.stringify({ progress: { processed, remaining, success, failed, ratePerMin } }) + '\n');
        }
      }
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));

  const rootGroups = [...rootToSubSet.entries()]
    .map(([root, set]) => ({ root, subcategories: [...set].sort((a, b) => a.localeCompare(b, 'ja-JP')) }))
    .sort((a, b) => a.root.localeCompare(b.root, 'ja-JP'));

  const rootSubcategoryCounts = [...rootSubCount.entries()]
    .map(([k, count]) => {
      const [root, subcategory] = k.split('///');
      return { root, subcategory, product_count: count };
    })
    .sort((a, b) => {
      const r = a.root.localeCompare(b.root, 'ja-JP');
      if (r !== 0) return r;
      return b.product_count - a.product_count;
    });

  return {
    processed,
    success,
    failed,
    unique_subcategories: subSet.size,
    root_groups: rootGroups,
    root_subcategory_counts: rootSubcategoryCounts,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const r = await extractSubcategories({
    limit: args.limit,
    concurrency: args.concurrency,
    delayMs: args.delayMs,
    progressEvery: args.progressEvery,
  });
  const result = { ok: true, ...r };
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

