// ===========================================
// Sitemap（P3-b）— sitemap index + 分片 + 品質 gate
// ===========================================
//
// 設計重點：
//  1) 零 SEO regression：keep set = 現時已經喺 sitemap 嘅 5,000 款（ORDER BY id DESC），
//     一個都唔會被移走（即使品質 gate 唔過）。
//  2) 品質 gate：active + 有圖 + price>0 + (有正庫存 OR 有成本 OR 有評價)，
//     先至有機會隨住分批放量加入。
//  3) 分批放量：SEO_SITEMAP_MAX_PRODUCT_URLS（預設 5000 = 現時水平）。
//     Phase 1 = 5000（維持現狀）→ Phase 2 = 8000 → Phase 3 = 12000。
//     唔會一次過全開 18,000+ URL。
//  4) 每個分片最多 5,000 URL（sitemap 規格建議上限；Google 支援 50,000 但分細啲易維護）。

const SITE_BASE = process.env.SEO_CANONICAL_BASE || process.env.SITE_BASE_URL || 'https://www.ohyagroups.com';
const SHARD_SIZE = 5000;
const DEFAULT_MAX_PRODUCT_URLS = 5000;
const MAX_PRODUCT_URLS_CEILING = 18000;

// 靜態頁：同原有 /sitemap.xml 完全一致（避免 SEO regression）
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/wholesale', changefreq: 'weekly', priority: '0.8' },
  { path: '/guide', changefreq: 'weekly', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.7' },
  { path: '/faq', changefreq: 'monthly', priority: '0.7' },
  { path: '/help', changefreq: 'monthly', priority: '0.6' },
  { path: '/shipping', changefreq: 'monthly', priority: '0.6' },
  { path: '/payment', changefreq: 'monthly', priority: '0.6' },
  { path: '/returns', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

const GUIDE_PATH_PREFIX = '/guide/';

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function maxProductUrls() {
  const raw = parseInt(process.env.SEO_SITEMAP_MAX_PRODUCT_URLS, 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_PRODUCT_URLS;
  return Math.min(raw, MAX_PRODUCT_URLS_CEILING);
}

function buildUrlSetXml(entries) {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${escapeXml(e.changefreq)}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${escapeXml(e.priority)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildSitemapIndexXml(sitemaps) {
  const body = sitemaps
    .map((s) => {
      const parts = [`    <loc>${escapeXml(s.loc)}</loc>`];
      if (s.lastmod) parts.push(`    <lastmod>${escapeXml(s.lastmod)}</lastmod>`);
      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/**
 * 產品集合 SQL
 *  - keep set：現時 sitemap 已覆蓋嘅 5,000 款（零 regression）
 *  - quality set：品質 gate 過到嘅 SKU
 *  - union 後 ORDER BY id DESC，再套 SEO_SITEMAP_MAX_PRODUCT_URLS 上限
 */
function buildSitemapProductsSql() {
  return `
WITH keep_set AS (
 SELECT p.id, p.updated_at
    FROM products p
   WHERE p.status = 'active'
     AND COALESCE(p.name_zh_hk, p.name) NOT ILIKE '%販売終了%'
   ORDER BY p.id DESC
   LIMIT 5000
),
quality_set AS (
  SELECT p.id, p.updated_at
    FROM products p
   WHERE p.status = 'active'
     AND p.deleted_at IS NULL
     AND COALESCE(p.name_zh_hk, p.name) NOT ILIKE '%販売終了%'
     AND COALESCE(p.image_url, '') <> ''
     AND COALESCE(p.price, 0) > 0
     AND (
       EXISTS (SELECT 1 FROM product_skus s WHERE s.product_id = p.id AND s.stock > 0)
       OR COALESCE(p.cost_price, 0) > 0
       OR EXISTS (SELECT 1 FROM product_skus s2 WHERE s2.product_id = p.id AND s2.cost_price > 0)
       OR COALESCE(p.review_count, 0) > 0
     )
),
merged AS (
  SELECT id, updated_at FROM keep_set
  UNION
  SELECT id, updated_at FROM quality_set
)
SELECT id, updated_at
  FROM merged
 ORDER BY id DESC
 LIMIT $1`;
}

/**
 * 將產品 id 清單切成分片。
 * @returns {Array<{index:number, from:number, to:number, ids:number[]}>}
 */
function shardProductIds(ids, shardSize = SHARD_SIZE) {
  const size = Math.max(1, parseInt(shardSize, 10) || SHARD_SIZE);
  const shards = [];
  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size);
    shards.push({
      index: shards.length + 1,
      from: i,
      to: i + slice.length,
      ids: slice,
    });
  }
  return shards;
}

function buildPagesEntries(guides = [], base = SITE_BASE) {
  const entries = STATIC_PAGES.map((p) => ({
    loc: `${base}${p.path}`,
    changefreq: p.changefreq,
    priority: p.priority,
  }));
  for (const g of guides) {
    entries.push({
      loc: `${base}${GUIDE_PATH_PREFIX}${g.slug}`,
      lastmod: g.updated_at || g.publish_at || null,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }
  return entries;
}

module.exports = {
  SITE_BASE,
  SHARD_SIZE,
  DEFAULT_MAX_PRODUCT_URLS,
  MAX_PRODUCT_URLS_CEILING,
  STATIC_PAGES,
  GUIDE_PATH_PREFIX,
  escapeXml,
  maxProductUrls,
  buildUrlSetXml,
  buildSitemapIndexXml,
  buildSitemapProductsSql,
  shardProductIds,
  buildPagesEntries,
};
