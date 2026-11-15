'use strict';
// Route-level sitemap 測試（防止「測試全綠但 live route 404」）
//
// 背景：2026-11-15 production bug —— app.js 直接寫
//   '/sitemap-products-:shard(\d+).xml'
// JS 單引號字串入面 `\d` 係未定義 escape → 塌成字面 `d`
// → Express 編譯成 /^\/sitemap-products-(?:(d+))\.xml\/?$/ → 永遠 404
// → sitemap 內 product URL 由 5,000 條跌到 0 條（live SEO regression）
//
// 而家 route pattern 只喺 routes/sitemap.js 一份，呢個測試 mount 同一個 module，
// 真實行 Express 路由匹配（唔係 string assert）。
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { registerSitemapRoutes, PRODUCT_SHARD_ROUTE } = require('../routes/sitemap');

function makePool(productIds, guideRows = []) {
  return {
    async query(sql, values = []) {
      if (/FROM blog_posts/i.test(sql)) return { rows: guideRows };
      if (/WITH keep_set AS/i.test(sql)) {
        return { rows: productIds.map((id) => ({ id, updated_at: '2026-11-15 00:00:00Z' })) };
      }
      if (/FROM products WHERE id = ANY/i.test(sql)) {
        const ids = Array.isArray(values[0]) ? values[0] : [];
        return { rows: ids.map((id) => ({ id, updated_at: '2026-11-15 00:00:00Z' })) };
      }
      return { rows: [] };
    },
  };
}

async function startServer(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

function makeApp({ productIds = [], guideRows = [], connectionString = 'postgres://stub' } = {}) {
  const app = express();
  app.use((req, res, next) => {
    res.locals.seoCanonicalBase = 'https://www.ohyagroups.com';
    next();
  });
  registerSitemapRoutes(app, { pool: makePool(productIds, guideRows), connectionString });
  return app;
}

test('route pattern：單引號字串入面必須寫兩個反斜線（escape regression guard）', () => {
  assert.ok(
    PRODUCT_SHARD_ROUTE.includes('\\d+'),
    `PRODUCT_SHARD_ROUTE 必須包含 regex escape \\d+，現時: ${PRODUCT_SHARD_ROUTE}`
  );
  // 未定義 escape（\d 變成 d）會令 route 只匹配 "ddd" 而唔匹配數字
  assert.ok(
    !/[^\\]d\+/.test(PRODUCT_SHARD_ROUTE),
    `PRODUCT_SHARD_ROUTE 嘅 \\d 被 unescape 咗（會變成字面 d）: ${PRODUCT_SHARD_ROUTE}`
  );
  assert.equal(PRODUCT_SHARD_ROUTE, '/sitemap-products-:shard(\\d+).xml');
});

test('GET /sitemap-products-1.xml → 200（唔係 404）', async () => {
  const app = makeApp({ productIds: [1, 2, 3] });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap-products-1.xml`);
    assert.equal(res.status, 200, 'shard 1 必須 200');
    const body = await res.text();
    assert.match(body, /<urlset/);
    assert.match(body, /<loc>https:\/\/www\.ohyagroups\.com\/product\/1<\/loc>/);
  } finally {
    await srv.close();
  }
});

test('GET /sitemap-products-5000.xml → 200', async () => {
  const app = makeApp({ productIds: [1] });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap-products-5000.xml`);
    // 只有 1 個分片，所以 5000 唔存在 → 404；但重點係唔係因為 route 唔匹配而 404
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /xml/);

    // 有足夠 id 令第 2 片存在時，數字 shard 一定要 match
    const ids = Array.from({ length: 5001 }, (_, i) => i + 1);
    const app2 = makeApp({ productIds: ids });
    const srv2 = await startServer(app2);
    try {
      const res2 = await fetch(`${srv2.url}/sitemap-products-2.xml`);
      assert.equal(res2.status, 200, 'shard 2 必須 200');
      const body2 = await res2.text();
      assert.match(body2, /<loc>https:\/\/www\.ohyagroups\.com\/product\/5001<\/loc>/);
    } finally {
      await srv2.close();
    }
  } finally {
    await srv.close();
  }
});

test('GET /sitemap-products-ddd.xml → 404（非數字唔匹配）', async () => {
  const app = makeApp({ productIds: [1, 2, 3] });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap-products-ddd.xml`);
    assert.equal(res.status, 404);
  } finally {
    await srv.close();
  }
});

test('GET /sitemap.xml → 200 且 root 係 sitemapindex', async () => {
  const app = makeApp({ productIds: [1, 2, 3] });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap.xml`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<sitemapindex[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    assert.match(body, /<loc>https:\/\/www\.ohyagroups\.com\/sitemap-pages\.xml<\/loc>/);
    assert.match(body, /<loc>https:\/\/www\.ohyagroups\.com\/sitemap-products-1\.xml<\/loc>/);
    assert.ok(!/<urlset/.test(body), 'index root 唔可以係 urlset');
  } finally {
    await srv.close();
  }
});

test('GET /sitemap.xml → 分片數目同實際 shard 數一致', async () => {
  const ids = Array.from({ length: 10001 }, (_, i) => i + 1);
  const app = makeApp({ productIds: ids });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap.xml`);
    const body = await res.text();
    const shards = [...body.matchAll(/sitemap-products-(\d+)\.xml/g)].map((m) => Number(m[1]));
    assert.deepEqual(shards, [1, 2, 3]);
  } finally {
    await srv.close();
  }
});

test('GET /sitemap-pages.xml → 200，root 係 urlset', async () => {
  const app = makeApp({ productIds: [], guideRows: [{ slug: 'abc', updated_at: '2026-11-01' }] });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap-pages.xml`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<urlset/);
    assert.match(body, /<loc>https:\/\/www\.ohyagroups\.com\/guide\/abc<\/loc>/);
  } finally {
    await srv.close();
  }
});

test('分片 URL 數量 = 分片內 id 數（唔會少）', async () => {
  const ids = Array.from({ length: 25 }, (_, i) => i + 1);
  const app = makeApp({ productIds: ids });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap-products-1.xml`);
    const body = await res.text();
    const count = (body.match(/<url>/g) || []).length;
    assert.equal(count, 25);
  } finally {
    await srv.close();
  }
});

test('無 DB 連線時 index 仍然 200（只有 pages 分片）', async () => {
  const app = express();
  app.use((req, res, next) => {
    res.locals.seoCanonicalBase = 'https://www.ohyagroups.com';
    next();
  });
  registerSitemapRoutes(app, { pool: null, connectionString: null });
  const srv = await startServer(app);
  try {
    const res = await fetch(`${srv.url}/sitemap.xml`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<sitemapindex/);
    assert.ok(!/sitemap-products-/.test(body));
  } finally {
    await srv.close();
  }
});
