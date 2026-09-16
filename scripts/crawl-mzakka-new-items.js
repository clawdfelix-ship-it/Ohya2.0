const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { fetchHtml, extractDescriptionFromDetailHtml } = require('./fetch-mzakka-description');
const {
  parseMzakkaCategoryPage,
  parseMzakkaDetailPage,
} = require('../utils/mzakkaNewItems');

function parseArgs(argv) {
  const args = {
    categoryId: 1894,
    startPage: 1,
    pages: 1,
    limit: 0,
    delayMs: 150,
    out: '',
    seenFile: '',
    includeEnded: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--category') args.categoryId = Number(argv[++i] || 1894);
    else if (a === '--start-page') args.startPage = Math.max(1, Number(argv[++i] || 1));
    else if (a === '--pages') args.pages = Math.max(0, Number(argv[++i] || 1));
    else if (a === '--limit') args.limit = Math.max(0, Number(argv[++i] || 0));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 0));
    else if (a === '--out') args.out = String(argv[++i] || '').trim();
    else if (a === '--seen-file') args.seenFile = String(argv[++i] || '').trim();
    else if (a === '--include-ended') args.includeEnded = true;
  }

  return args;
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCategoryPageUrl(categoryId, pageNumber) {
  const pageIndex = Math.max(0, Number(pageNumber || 1) - 1);
  return `https://mzakka.com/pc/detail/category.php?category=${encodeURIComponent(categoryId)}&p1=${pageIndex}`;
}

async function loadSeenIds(file) {
  if (!file) return new Set();
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return new Set();

  const seen = new Set();
  const input = fs.createReadStream(resolved);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const id = parsed && parsed.id ? String(parsed.id).trim() : '';
      if (id) seen.add(id);
    } catch {
      // Ignore malformed lines so a partially written file does not block crawling.
    }
  }
  rl.close();
  return seen;
}

function toJsonlRecord(listItem, detailItem) {
  return {
    id: detailItem.id || listItem.id,
    name: detailItem.name || listItem.name,
    description: detailItem.description || listItem.summary || '',
    category: detailItem.category || '未分類',
    priceYen: Number.isFinite(detailItem.priceYen) ? detailItem.priceYen : listItem.priceYen,
    originalPriceYen: Number.isFinite(detailItem.originalPriceYen)
      ? detailItem.originalPriceYen
      : listItem.originalPriceYen,
    images: Array.isArray(detailItem.images) && detailItem.images.length
      ? detailItem.images
      : (listItem.imageUrl ? [listItem.imageUrl] : []),
    productUrl: detailItem.productUrl || listItem.productUrl,
    statusText: detailItem.statusText || listItem.statusText || '',
  };
}

async function crawlMzakkaNewItems(options = {}) {
  const categoryId = Number(options.categoryId || 1894);
  const startPage = Math.max(1, Number(options.startPage || 1));
  const pages = Math.max(0, Number(options.pages || 1));
  const limit = Math.max(0, Number(options.limit || 0));
  const delayMs = Math.max(0, Number(options.delayMs || 0));
  const includeEnded = Boolean(options.includeEnded);
  const seenIds = options.seenIds instanceof Set ? new Set(options.seenIds) : new Set();

  const records = [];
  const visitedIds = new Set();
  const seenPages = [];
  let totalPages = null;
  let listItemsSeen = 0;

  for (let pageNumber = startPage; ; pageNumber++) {
    if (pages && pageNumber >= startPage + pages) break;
    if (limit && records.length >= limit) break;
    if (totalPages != null && pageNumber > totalPages) break;

    const listUrl = buildCategoryPageUrl(categoryId, pageNumber);
    const listHtml = await fetchHtml(listUrl);
    const parsedList = parseMzakkaCategoryPage(listHtml);
    totalPages = parsedList.totalPages;
    seenPages.push(pageNumber);
    listItemsSeen += parsedList.items.length;

    for (const listItem of parsedList.items) {
      if (limit && records.length >= limit) break;
      if (!listItem.id || visitedIds.has(listItem.id) || seenIds.has(listItem.id)) continue;

      visitedIds.add(listItem.id);
      const detailHtml = await fetchHtml(listItem.productUrl);
      const detailItem = parseMzakkaDetailPage(detailHtml, {
        productUrl: listItem.productUrl,
        extractDescription: extractDescriptionFromDetailHtml,
      });

      if (!includeEnded && detailItem.isEnded) {
        continue;
      }

      records.push(toJsonlRecord(listItem, detailItem));
      if (delayMs) await sleep(delayMs);
    }

    if (parsedList.items.length === 0) break;
  }

  return {
    categoryId,
    startPage,
    pagesRequested: pages,
    pagesFetched: seenPages.length,
    pageNumbers: seenPages,
    totalPages,
    listItemsSeen,
    records,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const seenIds = await loadSeenIds(args.seenFile);
  const result = await crawlMzakkaNewItems({
    categoryId: args.categoryId,
    startPage: args.startPage,
    pages: args.pages,
    limit: args.limit,
    delayMs: args.delayMs,
    includeEnded: args.includeEnded,
    seenIds,
  });

  if (args.out) {
    const resolved = path.resolve(args.out);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const body = result.records.map((record) => JSON.stringify(record)).join('\n');
    fs.writeFileSync(resolved, body ? `${body}\n` : '', 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    categoryId: result.categoryId,
    pagesFetched: result.pagesFetched,
    totalPages: result.totalPages,
    listItemsSeen: result.listItemsSeen,
    recordsWritten: result.records.length,
    out: args.out ? path.resolve(args.out) : null,
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(String((err && err.message) || err));
    process.exitCode = 1;
  });
}

module.exports = {
  buildCategoryPageUrl,
  crawlMzakkaNewItems,
  loadSeenIds,
  parseArgs,
  toJsonlRecord,
};
