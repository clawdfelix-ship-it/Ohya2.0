#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { acquireSyncLock, releaseSyncLock, loadSyncEnvironment } = require('./sync-all-categories');
const { fetchHtml, extractDescriptionFromDetailHtml } = require('./fetch-mzakka-description');
const { parseMzakkaDetailPage } = require('../utils/mzakkaNewItems');
const { importMzakkaRecords } = require('./import-mzakka-to-postgres');
const { runDescriptionBackfill, recordFailureAttempts } = require('./lib/mzakka-description-backfill');
const { attachPoolErrorHandler, queryWithRetry, withDbRetry } = require('./lib/mzakka-db-resilience');

const ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'state', 'description-backfill-v2.json');
const FAILURE_FILE = path.join(ROOT, 'state', 'description-backfill-v2-failures.jsonl');
const VERSION = 'mzakka-description-v2';
const MAX_BATCH_SIZE = 100;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  let limit = positiveInteger(env.DESCRIPTION_BACKFILL_LIMIT, MAX_BATCH_SIZE);
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--limit') limit = positiveInteger(argv[++index], limit);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return { limit: Math.min(limit, MAX_BATCH_SIZE) };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const env = loadSyncEnvironment({ ...process.env, SYNC_ENV_FILE: process.env.SYNC_ENV_FILE || '.vercel/.env.production.local' });
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const lockFile = env.SYNC_LOCK_FILE || path.join(ROOT, 'state', 'sync-write.lock');
  const lock = acquireSyncLock(lockFile);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
  // An idle connection can die while a M-ZAKKA request is in flight. Without
  // this handler pg emits an unhandled error and kills the entire batch.
  attachPoolErrorHandler(pool);
  const prior = readState();
  const skippedIds = new Set(prior.skippedIds || []);
  const completedIds = new Set(prior.completedIds || []);
  const failureAttempts = { ...(prior.failureAttempts || {}) };
  const countedFailureIds = new Set();
  let lastPersist = 0;
  try {
    const result = await queryWithRetry(
      pool,
      `SELECT id, source_key, source_url, description_zh_hk, raw_payload
       FROM products
       WHERE source = 'mzakka'
         AND source_key IS NOT NULL
         AND source_url IS NOT NULL
         AND COALESCE(raw_payload->>'descriptionVersion', '') <> $1
       ORDER BY id`,
      [VERSION]
    );
    const products = result.rows.filter((product) => !skippedIds.has(String(product.source_key)));
    console.log(`DESCRIPTION_BACKFILL_START ${JSON.stringify({ candidates: products.length, batchLimit: args.limit, previouslyCompleted: completedIds.size, skipped: skippedIds.size })}`);
    const summary = await runDescriptionBackfill({
      products,
      completedIds,
      concurrency: Number(env.DESCRIPTION_BACKFILL_CONCURRENCY || 4),
      delayMs: Number(env.DESCRIPTION_BACKFILL_DELAY_MS || 200),
      limit: args.limit,
      fetchDetail: async (product) => {
        const sourceUrl = new URL(product.source_url);
        if (sourceUrl.hostname !== 'mzakka.com' || !sourceUrl.searchParams.get('item_id')) {
          throw new Error('stored source URL has no usable M-ZAKKA item link');
        }
        sourceUrl.protocol = 'https:';
        sourceUrl.pathname = '/pc/detail/item.php';
        const html = await fetchHtml(sourceUrl.toString(), { label: `description ${product.source_key}` });
        return parseMzakkaDetailPage(html, {
          productUrl: sourceUrl.toString(),
          extractDescription: extractDescriptionFromDetailHtml,
        });
      },
      // Retry the whole single-product, idempotent transaction. This also
      // covers pool.connect() and transaction errors, not just pool.query().
      upload: async (records) => withDbRetry(() => importMzakkaRecords({
        records,
        pool,
        batchSize: records.length,
      })),
      persist: async (current, done) => {
        const now = Date.now();
        if (now - lastPersist < 5000 && current.status === 'running') return;
        lastPersist = now;
        const failures = current.failures || [];
        recordFailureAttempts(failures, failureAttempts, skippedIds, countedFailureIds);
        saveJsonAtomic(STATE_FILE, {
          ...current,
          failures: failures.slice(-100),
          completedIds: [...done],
          skippedIds: [...skippedIds],
          failureAttempts,
          updatedAt: new Date().toISOString(),
        });
        if (failures.length) saveJsonAtomic(FAILURE_FILE, failures);
      },
    });
    console.log(`DESCRIPTION_BACKFILL_DONE ${JSON.stringify({ ...summary, failures: summary.failures.length })}`);
    if (summary.failed || summary.idMismatch) process.exitCode = 2;
  } finally {
    await pool.end();
    releaseSyncLock(lockFile, lock);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FATAL ${String((error && error.stack) || error)}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
