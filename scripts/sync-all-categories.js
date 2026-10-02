'use strict';

/**
 * sync-all-categories.js
 *
 * 可續跑嘅全店同步 orchestrator：
 *  - 逐個葉分類（data/mzakka-taxonomy.json 嘅 leaves）、逐頁爬 mzakka
 *  - 全局 seen set（state/seen-ids.json）去重，跨分類/重啟都唔重複爬
 *  - 每爬滿 BATCH 個新商品就 POST 上生產「純匯入端點」（mzakka-import），
 *    避免 serverless timeout；本機只負責爬網
 *  - 進度持久化（state/sync-all-state.json），中途中斷可由最後分類/頁繼續
 *
 * Env:
 *  - CRON_SECRET           內部端點認證
 *  - SYNC_BASE_URL         預設 https://ohya2-0.vercel.app
 *  - SYNC_DELAY_MS         每個 detail 之間禮貌 delay，預設 120
 *  - SYNC_BATCH            每次 POST 商品數，預設 15
 *  - SYNC_INCLUDE_ENDED    'true' 先同步已下架，預設 false
 *  - SYNC_START_LEAF       由第幾個 leaf 開始（0-based，調試用）
 */

const fs = require('node:fs');
const path = require('node:path');
const { crawlMzakkaNewItems } = require('./crawl-mzakka-new-items');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state');
const SEEN_FILE = path.join(STATE_DIR, 'seen-ids.json');
const STATE_FILE = path.join(STATE_DIR, 'sync-all-state.json');

const BASE_URL = process.env.SYNC_BASE_URL || 'https://ohya2-0.vercel.app';
const IMPORT_URL = `${BASE_URL}/api/internal/jobs/mzakka-import`;
const SECRET = process.env.CRON_SECRET;
const DELAY_MS = Number(process.env.SYNC_DELAY_MS) >= 0 ? Number(process.env.SYNC_DELAY_MS) : 120;
const BATCH = Number(process.env.SYNC_BATCH) > 0 ? Number(process.env.SYNC_BATCH) : 15;
const INCLUDE_ENDED = process.env.SYNC_INCLUDE_ENDED === 'true';
const START_LEAF = Number(process.env.SYNC_START_LEAF) >= 0 ? Number(process.env.SYNC_START_LEAF) : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSeen() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  // seen set 會越來越大，用 compact array 儲
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...set]));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { leafIndex: 0, lastPage: 0, totalUploaded: 0, totalNew: 0, done: [] };
  }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

async function uploadBatch(records) {
  const body = JSON.stringify({ records, batchSize: 100 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(IMPORT_URL, {
      method: 'POST',
      headers: {
        'x-sync-secret': SECRET,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(`import ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!SECRET) throw new Error('CRON_SECRET is not set');
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const tax = require(path.join(ROOT, 'data', 'mzakka-taxonomy.json'));
  const leaves = [];
  const walk = (n) => {
    if (!n.children || !n.children.length) leaves.push({ id: n.id, name: n.name });
    else n.children.forEach(walk);
  };
  tax.roots.forEach(walk);

  const seen = loadSeen();
  const state = loadState();

  let startIdx = state.leafIndex || 0;
  if (START_LEAF != null) startIdx = START_LEAF;

  let pending = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    // 簡單重試（最多 3 次）
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await uploadBatch(batch);
        state.totalUploaded += batch.length;
        console.log(
          `[upload] ${batch.length} items | products=${r.productsUpserted} skus=${r.skusUpserted} ` +
          `media=${r.mediaUpserted} unresolved=${r.categoriesUnresolved} | total=${state.totalUploaded}`
        );
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`[upload] attempt ${attempt} failed: ${String(e.message || e)}`);
        await sleep(3000 * attempt);
      }
    }
    throw new Error(`upload failed after retries: ${lastErr}`);
  };

  for (let li = startIdx; li < leaves.length; li++) {
    const leaf = leaves[li];
    state.leafIndex = li;

    // 先探測總頁數（爬第 1 頁就知 totalPages）
    // 用 seen set 跳過已爬商品，逐頁直到爬完
    let page = (li === startIdx && state.lastPage) ? state.lastPage + 1 : 1;
    console.log(`\n=== leaf ${li + 1}/${leaves.length} id=${leaf.id} ${leaf.name} (from page ${page}) ===`);

    // crawl one page at a time so work units stay bounded
    let totalPages = null;
    while (true) {
      const result = await crawlMzakkaNewItems({
        categoryId: leaf.id,
        startPage: page,
        pages: 1,
        limit: 0,
        delayMs: DELAY_MS,
        includeEnded: INCLUDE_ENDED,
        seenIds: seen, // crawler 會跳過呢啲 id
      });
      totalPages = result.totalPages;

      const newRecords = result.records;
      for (const rec of newRecords) {
        if (rec.id) seen.add(String(rec.id));
        pending.push(rec);
        state.totalNew++;
        if (pending.length >= BATCH) {
          await flush();
          saveSeen(seen);
          saveState(state);
        }
      }

      state.lastPage = page;
      saveSeen(seen);
      saveState(state);

      console.log(
        `  page ${page}/${totalPages} list=${result.listItemsSeen} new=${newRecords.length} ` +
        `pending=${pending.length} seen=${seen.size}`
      );

      if (totalPages != null && page >= totalPages) break;
      if (result.listItemsSeen === 0) break;
      page++;
    }

    // 每個分類收尾，確保 pending 清空先入下一個
    await flush();
    if (!state.done.includes(leaf.id)) state.done.push(leaf.id);
    state.lastPage = 0;
    saveSeen(seen);
    saveState(state);
  }

  console.log(`\n✅ all ${leaves.length} leaf categories synced. total new=${state.totalNew} uploaded=${state.totalUploaded}`);
}

main().catch((err) => {
  console.error('FATAL:', String((err && err.message) || err));
  process.exitCode = 1;
});
