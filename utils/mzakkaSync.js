const fs = require('node:fs');
const path = require('node:path');

const { crawlMzakkaNewItems } = require('../scripts/crawl-mzakka-new-items');
const { importMzakkaRecords } = require('../scripts/import-mzakka-to-postgres');

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function normalizeSyncOptions(input = {}) {
  return {
    categoryId: toPositiveInt(input.categoryId || input.category_id, 1894),
    startPage: toPositiveInt(input.startPage || input.start_page, 1),
    pages: toPositiveInt(input.pages, 1),
    limit: toNonNegativeInt(input.limit, 0),
    delayMs: toNonNegativeInt(input.delayMs || input.delay_ms, 150),
    includeEnded: toBoolean(input.includeEnded || input.include_ended, false),
    batchSize: toPositiveInt(input.batchSize || input.batch_size, 100),
    debugJsonlPath: typeof input.debugJsonlPath === 'string' && input.debugJsonlPath.trim()
      ? input.debugJsonlPath.trim()
      : '',
  };
}

function writeJsonlFile(records, filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  fs.writeFileSync(resolved, body ? `${body}\n` : '', 'utf8');
  return resolved;
}

function createMzakkaSyncService(deps = {}) {
  const crawl = deps.crawlMzakkaNewItems || crawlMzakkaNewItems;
  const importRecords = deps.importMzakkaRecords || importMzakkaRecords;

  async function syncMzakkaNewItemsToDb(options = {}) {
    const normalized = normalizeSyncOptions(options);
    const crawlResult = await crawl({
      categoryId: normalized.categoryId,
      startPage: normalized.startPage,
      pages: normalized.pages,
      limit: normalized.limit,
      delayMs: normalized.delayMs,
      includeEnded: normalized.includeEnded,
    });

    const records = Array.isArray(crawlResult.records) ? crawlResult.records : [];
    const debugJsonlPath = normalized.debugJsonlPath
      ? writeJsonlFile(records, normalized.debugJsonlPath)
      : null;

    let importResult = {
      mode: 'import',
      linesRead: 0,
      categoriesUpserted: 0,
      productsUpserted: 0,
      skusUpserted: 0,
    };

    if (records.length > 0) {
      importResult = await importRecords({
        records,
        batchSize: normalized.batchSize,
        pool: options.pool,
      });
    }

    return {
      categoryId: normalized.categoryId,
      startPage: normalized.startPage,
      pagesRequested: normalized.pages,
      pagesFetched: crawlResult.pagesFetched || 0,
      pageNumbers: crawlResult.pageNumbers || [],
      totalPages: crawlResult.totalPages || 0,
      listItemsSeen: crawlResult.listItemsSeen || 0,
      recordsFetched: records.length,
      includeEnded: normalized.includeEnded,
      batchSize: normalized.batchSize,
      debugJsonlPath,
      import: importResult,
    };
  }

  return {
    syncMzakkaNewItemsToDb,
  };
}

const defaultService = createMzakkaSyncService();

module.exports = {
  createMzakkaSyncService,
  normalizeSyncOptions,
  syncMzakkaNewItemsToDb: defaultService.syncMzakkaNewItemsToDb,
  writeJsonlFile,
};
