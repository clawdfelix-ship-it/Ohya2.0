// ===========================================
// Sitemap routes（P3-b）
// ===========================================
//
// 抽出成獨立模組嘅原因：
//  2026-11-15 曾经喺 app.js 直接寫
//    '/sitemap-products-:shard(\d+).xml'
//  JS 單引號字串入面 `\d` 係未定義 escape → 塌成字面 `d`
//  → Express 編譯成 /^\/sitemap-products-(?:(d+))\.xml\/?$/ → live route 永遠 404
//  → product URL 喺 sitemap 內由 5,000 條跌到 0 條（live SEO regression）
//
// 而家 route pattern 只有一份（呢個檔案），測試直接 mount 同一個 module，
// 所以同類 escape 錯誤唔會再「測試全綠但 live 404」。
//
// Routes：
//   GET /sitemap.xml                -> sitemap index（sitemapindex root）
//   GET /sitemap-pages.xml          -> 靜態頁 + 已發佈指南
//   GET /sitemap-products-:shard(\\d+).xml -> 產品分片（每片 <= 5,000）

const sitemapLib = require('../lib/sitemap');

// ⚠️ 單引號字串要寫兩個反斜線，先會傳出真正嘅 regex `\d`
const PRODUCT_SHARD_ROUTE = '/sitemap-products-:shard(\\d+).xml';

function canonicalBase(res) {
  return res.locals.seoCanonicalBase || process.env.SEO_CANONICAL_BASE || 'https://www.ohyagroups.com';
}

/**
 * @param {import('express').Express} app
 * @param {{pool?: {query: Function}, connectionString?: string|null}} deps
 */
function registerSitemapRoutes(app, deps = {}) {
  const pool = deps.pool || null;
  const connectionString = deps.connectionString || null;

  // sitemap index
  app.get('/sitemap.xml', async (req, res) => {
    const base = canonicalBase(res);
    const lastmod = new Date().toISOString().slice(0, 10);
    const sitemaps = [{ loc: base + '/sitemap-pages.xml', lastmod }];
    let productShards = 0;
    if (connectionString && pool) {
      try {
        const idsRes = await pool.query(sitemapLib.buildSitemapProductsSql(), [sitemapLib.maxProductUrls()]);
        const ids = (idsRes.rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
        productShards = sitemapLib.shardProductIds(ids).length;
      } catch (e) {
        console.error('sitemap products query failed:', e.message);
      }
    }
    for (let i = 1; i <= productShards; i += 1) {
      sitemaps.push({ loc: base + '/sitemap-products-' + i + '.xml', lastmod });
    }
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(sitemapLib.buildSitemapIndexXml(sitemaps));
  });

  // sitemap 分頁：靜態頁 + 指南
  app.get('/sitemap-pages.xml', async (req, res) => {
    const base = canonicalBase(res);
    const guides = [];
    if (connectionString && pool) {
      try {
        const r = await pool.query(
          `SELECT slug, updated_at, publish_at FROM blog_posts WHERE status = 'published' ORDER BY publish_at DESC NULLS LAST LIMIT 500`
        );
        guides.push(...(r.rows || []));
      } catch (e) {
        console.error('sitemap blog query failed:', e.message);
      }
    }
    const entries = sitemapLib.buildPagesEntries(guides, base);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(sitemapLib.buildUrlSetXml(entries));
  });

  // sitemap 分頁：產品分片
  app.get(PRODUCT_SHARD_ROUTE, async (req, res) => {
    const base = canonicalBase(res);
    const shardNo = parseInt(req.params.shard, 10);
    let entries = [];
    if (connectionString && pool && shardNo >= 1) {
      try {
        const idsRes = await pool.query(sitemapLib.buildSitemapProductsSql(), [sitemapLib.maxProductUrls()]);
        const ids = (idsRes.rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
        const shards = sitemapLib.shardProductIds(ids);
        const shard = shards.find((s) => s.index === shardNo);
        if (shard) {
          const rowsRes = await pool.query(
            `SELECT id, updated_at FROM products WHERE id = ANY($1::int[])`,
            [shard.ids]
          );
          const byId = new Map((rowsRes.rows || []).map((r) => [Number(r.id), r]));
          entries = shard.ids.map((id) => {
            const row = byId.get(id);
            const lastmod = row && row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : null;
            return { loc: base + '/product/' + id, lastmod, changefreq: 'weekly', priority: '0.8' };
          });
        }
      } catch (e) {
        console.error('sitemap product shard query failed:', e.message);
      }
    }
    if (!entries.length) {
      return res.status(404).type('application/xml; charset=utf-8').send(sitemapLib.buildUrlSetXml([]));
    }
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(sitemapLib.buildUrlSetXml(entries));
  });
}

module.exports = {
  registerSitemapRoutes,
  PRODUCT_SHARD_ROUTE,
};
