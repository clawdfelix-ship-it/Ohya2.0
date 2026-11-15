'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const sitemapLib = require('../lib/sitemap');

test('sitemap index：包含 pages + 每個產品分片，格式合法', () => {
  const xml = sitemapLib.buildSitemapIndexXml([
    { loc: 'https://www.ohyagroups.com/sitemap-pages.xml', lastmod: '2026-11-15' },
    { loc: 'https://www.ohyagroups.com/sitemap-products-1.xml', lastmod: '2026-11-15' },
    { loc: 'https://www.ohyagroups.com/sitemap-products-2.xml', lastmod: '2026-11-15' },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.ohyagroups\.com\/sitemap-pages\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/www\.ohyagroups\.com\/sitemap-products-1\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/www\.ohyagroups\.com\/sitemap-products-2\.xml<\/loc>/);
  assert.match(xml, /<lastmod>2026-11-15<\/lastmod>/);
});

test('urlset：格式合法 + XML escape', () => {
  const xml = sitemapLib.buildUrlSetXml([
    { loc: 'https://www.ohyagroups.com/product/1', lastmod: '2026-11-15', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://www.ohyagroups.com/guide/a?x=1&y=2', changefreq: 'monthly', priority: '0.7' },
  ]);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.ohyagroups\.com\/product\/1<\/loc>/);
  assert.match(xml, /&amp;/);
  assert.ok(!/[^&]&[^a-z]/.test(xml), 'raw ampersand must be escaped');
});

test('分片：每片 <= 5,000，全部 id 有出現且無重複', () => {
  const ids = Array.from({ length: 12001 }, (_, i) => i + 1);
  const shards = sitemapLib.shardProductIds(ids);
  assert.equal(shards.length, 3);
  assert.equal(shards[0].ids.length, 5000);
  assert.equal(shards[1].ids.length, 5000);
  assert.equal(shards[2].ids.length, 2001);
  for (const s of shards) assert.ok(s.ids.length <= 5000, 'shard must be <= 5000 urls');
  const flat = shards.flatMap((s) => s.ids);
  assert.equal(flat.length, ids.length);
  assert.equal(new Set(flat).size, ids.length);
});

test('分片：0 個 id → 0 個分片；單片情況', () => {
  assert.equal(sitemapLib.shardProductIds([]).length, 0);
  assert.equal(sitemapLib.shardProductIds([7]).length, 1);
  assert.deepEqual(sitemapLib.shardProductIds([7])[0].ids, [7]);
});

test('品質 gate SQL：有齊所有條件（active / 有圖 / price>0 / 成本或庫存或評價）', () => {
  const sql = sitemapLib.buildSitemapProductsSql();
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /deleted_at IS NULL/);
  assert.match(sql, /image_url/);
  assert.match(sql, /price/);
  assert.match(sql, /stock > 0/);
  assert.match(sql, /cost_price/);
  assert.match(sql, /review_count/);
  assert.match(sql, /LIMIT \$1/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(sql), 'sitemap query must be read-only');
});

test('品質 gate SQL：keep set 保留現有 5,000 款（零 SEO regression）', () => {
  const sql = sitemapLib.buildSitemapProductsSql();
  const keepSet = sql.match(/WITH keep_set AS \(([\s\S]*?)\),\s*quality_set AS/);
  assert.ok(keepSet, 'keep_set must be present');
  // keep_set 用現時 criteria + LIMIT 5000 + ORDER BY id DESC
  assert.match(sql, /WITH keep_set AS/);
  assert.match(sql, /ORDER BY p\.id DESC\s+LIMIT 5000/);
  assert.ok(!/deleted_at/.test(keepSet[1]), 'keep_set must match the previously indexed 5,000 exactly');
  // union 兩邊
  assert.match(sql, /SELECT id, updated_at FROM keep_set\s+UNION\s+SELECT id, updated_at FROM quality_set/);
  // 最後 ORDER BY id DESC（維持原本 id DESC 排序）
  assert.match(sql, /ORDER BY id DESC\s+LIMIT \$1/);
});

test('cap：預設 5,000，可調但唔可以超過 18,000', () => {
  const old = process.env.SEO_SITEMAP_MAX_PRODUCT_URLS;
  try {
    delete process.env.SEO_SITEMAP_MAX_PRODUCT_URLS;
    assert.equal(sitemapLib.maxProductUrls(), 5000);
    process.env.SEO_SITEMAP_MAX_PRODUCT_URLS = '8000';
    assert.equal(sitemapLib.maxProductUrls(), 8000);
    process.env.SEO_SITEMAP_MAX_PRODUCT_URLS = '999999';
    assert.equal(sitemapLib.maxProductUrls(), 18000);
    process.env.SEO_SITEMAP_MAX_PRODUCT_URLS = 'abc';
    assert.equal(sitemapLib.maxProductUrls(), 5000);
    process.env.SEO_SITEMAP_MAX_PRODUCT_URLS = '-1';
    assert.equal(sitemapLib.maxProductUrls(), 5000);
  } finally {
    if (old === undefined) delete process.env.SEO_SITEMAP_MAX_PRODUCT_URLS;
    else process.env.SEO_SITEMAP_MAX_PRODUCT_URLS = old;
  }
});

test('cap 語意：cap=5000 → 總數維持 5,000（唔會一次過全開）', () => {
  const ids = Array.from({ length: 20000 }, (_, i) => i + 1);
  // 模擬 DB 回傳已按 cap 截斷嘅 id
  const capped = ids.slice(0, 5000);
  const shards = sitemapLib.shardProductIds(capped);
  const total = shards.reduce((n, s) => n + s.ids.length, 0);
  assert.equal(total, 5000);
  assert.equal(shards.length, 1);
});

test('pages entries：靜態頁 + 指南 URL 格式同現有一致', () => {
  const entries = sitemapLib.buildPagesEntries([{ slug: 'my-guide', updated_at: '2026-11-01' }]);
  const locs = entries.map((e) => e.loc);
  assert.ok(locs.includes('https://www.ohyagroups.com/'));
  assert.ok(locs.includes('https://www.ohyagroups.com/products'));
  assert.ok(locs.includes('https://www.ohyagroups.com/guide'));
  assert.ok(locs.includes('https://www.ohyagroups.com/guide/my-guide'));
  // 現有 static pages 一定要保留（避免 SEO regression）
  for (const p of ['/wholesale', '/help', '/payment', '/returns', '/terms', '/privacy', '/faq', '/about', '/contact', '/shipping']) {
    assert.ok(locs.includes('https://www.ohyagroups.com' + p), `missing static page ${p}`);
  }
  const custom = sitemapLib.buildPagesEntries([{ slug: 'my-guide' }], 'https://example.com');
  assert.equal(custom[0].loc, 'https://example.com/');
  assert.equal(custom[custom.length - 1].loc, 'https://example.com/guide/my-guide');
});
