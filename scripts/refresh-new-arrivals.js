#!/usr/bin/env node
'use strict';
/**
 * refresh-new-arrivals.js
 *
 * mzakka「新商品」係網站 pseudo-top 節點 1789（唔係分類 rank 入面嘅 node 1）。
 * 呢度用 scripts/lib/mzakka-taxonomy.js 嘅 polite fetcher，由 category=1789
 * 第一頁讀 paging，順序捉晒所有頁，extract item links（文檔次序 = mzakka 新商品次序），
 * 輸出 data/new-arrivals.json：{ generatedAt, total, items:[itemId,...] }。
 *
 * Usage: node scripts/refresh-new-arrivals.js [--apply]
 *   冇 --apply：照爬（會用/更新 cache）並印 summary，但唔寫 data 檔以外副作用；
 *   其實 data 檔一定會寫，--apply 只係語意上標記「確認刷新」。
 */
const fs = require('node:fs');
const path = require('node:path');
const lib = require(path.join(__dirname, 'lib', 'mzakka-taxonomy.js'));

const ROOT = path.join(__dirname, '..');
const NEW_NODE = 1789;
const OUT = path.join(ROOT, 'data', 'new-arrivals.json');

(async () => {
  const cacheDir = path.join(ROOT, 'tmp', 'mzakka-new-cache');
  const fetch = lib.createFetcher({ cacheDir, refresh: true, delayMs: 900 });

  // first page -> paging
  const firstHtml = await fetch.categoryPage(NEW_NODE, 0);
  const paging = lib.extractPaging(firstHtml);
  console.log('new-arrival paging:', JSON.stringify(paging));

  const pages = paging.pages || 1;
  const items = [];
  const seen = new Set();

  function absorb(html) {
    const links = lib.extractItemLinks(html);
    for (const lk of links) {
      if (!seen.has(lk.itemId)) { seen.add(lk.itemId); items.push(lk.itemId); }
    }
  }
  absorb(firstHtml);

  for (let p1 = 1; p1 < pages; p1++) {
    const html = await fetch.categoryPage(NEW_NODE, p1);
    const before = items.length;
    absorb(html);
    if (p1 % 5 === 0 || p1 === pages - 1) {
      console.log(`page p1=${p1}/${pages - 1} total items=${items.length} (+${items.length - before})`);
    }
  }

  const data = {
    generatedAt: new Date().toISOString(),
    source: `mzakka category=${NEW_NODE} (新商品), document order`,
    total: items.length,
    items,
  };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`\nwrote ${OUT}: ${items.length} items`);
  console.log('first 15:', items.slice(0, 15).join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
