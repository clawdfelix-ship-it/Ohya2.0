'use strict';

/**
 * Resumable Mzakka discovery and known-product refresh.
 *
 * Safe by default: without SYNC_WRITE_ENABLED=true this is a bounded dry-run
 * (one leaf, one page, five detail records) and never uploads or saves state.
 * Set SYNC_REFRESH_EXISTING=true/false to override the seven-day refresh cycle.
 * SYNC_REFRESH_INTERVAL_DAYS, SYNC_DELAY_MS and SYNC_BATCH tune a write run.
 */

const fs = require('node:fs');
const path = require('node:path');
const { crawlMzakkaNewItems } = require('./crawl-mzakka-new-items');
const { runSyncAllCategories } = require('./lib/mzakka-sync-runner');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state');
const SEEN_FILE = path.join(STATE_DIR, 'seen-ids.json');
const DISCOVERY_STATE_FILE = path.join(STATE_DIR, 'sync-all-state.json');
const REFRESH_STATE_FILE = path.join(STATE_DIR, 'sync-refresh-state.json');
const HEALTH_FILE = path.join(STATE_DIR, 'sync-last-run.json');

function nonNegativeInteger(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseSyncConfig(env = process.env) {
  const writeEnabled = env.SYNC_WRITE_ENABLED === 'true';
  const refreshExisting = env.SYNC_REFRESH_EXISTING == null || env.SYNC_REFRESH_EXISTING === ''
    ? null
    : env.SYNC_REFRESH_EXISTING === 'true';
  return {
    writeEnabled,
    refreshExisting,
    refreshIntervalDays: nonNegativeInteger(env.SYNC_REFRESH_INTERVAL_DAYS, 7),
    includeEnded: env.SYNC_INCLUDE_ENDED === 'true',
    startLeaf: env.SYNC_START_LEAF == null ? null : nonNegativeInteger(env.SYNC_START_LEAF, null),
    delayMs: nonNegativeInteger(env.SYNC_DELAY_MS, 120),
    batchSize: nonNegativeInteger(env.SYNC_BATCH, 15) || 15,
    maxLeaves: nonNegativeInteger(env.SYNC_MAX_LEAVES, writeEnabled ? 0 : 1),
    maxPagesPerLeaf: nonNegativeInteger(env.SYNC_MAX_PAGES_PER_LEAF, writeEnabled ? 0 : 1),
    limit: nonNegativeInteger(env.SYNC_LIMIT, writeEnabled ? 0 : 5),
    baseUrl: env.SYNC_BASE_URL || 'https://ohya2-0.vercel.app',
  };
}

function shouldRefreshExisting(state, config, now = new Date()) {
  if (typeof config.refreshExisting === 'boolean') return config.refreshExisting;
  const last = Date.parse(state.lastRefreshAt || '');
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= config.refreshIntervalDays * 24 * 60 * 60 * 1000;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function initialState() {
  return { leafIndex: 0, lastPage: 0, totalUploaded: 0, totalNew: 0, done: [] };
}

function saveJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

async function loadKnownMzakkaIds(pool) {
  const result = await pool.query("SELECT source_key FROM products WHERE source = 'mzakka'");
  return new Set(result.rows.map((row) => String(row.source_key || '').trim()).filter(Boolean));
}

function createUpload(config, secret) {
  const url = `${config.baseUrl}/api/internal/jobs/mzakka-import`;
  return async function uploadBatch(records) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-sync-secret': secret, 'Content-Type': 'application/json' },
            body: JSON.stringify({ records, batchSize: 100 }),
            signal: controller.signal,
          });
          const json = await response.json();
          if (!response.ok || !json.ok) throw new Error(`import ${response.status}`);
          return json.result;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
        }
      }
      throw new Error(`upload failed after retries: ${String(lastError.message || lastError)}`);
    } finally {
      clearTimeout(timer);
    }
  };
}

function loadLeaves() {
  const taxonomy = readJson(path.join(ROOT, 'data', 'mzakka-taxonomy.json'), { roots: [] });
  const leaves = [];
  const walk = (node) => {
    if (!node.children || !node.children.length) leaves.push({ id: node.id, name: node.name });
    else node.children.forEach(walk);
  };
  taxonomy.roots.forEach(walk);
  return leaves;
}

function loadSyncEnvironment(env = process.env, root = ROOT) {
  const selectedFile = env.SYNC_ENV_FILE
    ? path.resolve(env.SYNC_ENV_FILE)
    : env.NODE_ENV === 'production'
      ? path.join(root, '.vercel', '.env.production.local')
      : null;
  if (!selectedFile) return { ...env };
  const values = require('dotenv').parse(fs.readFileSync(selectedFile));
  // An explicitly selected environment file must win over shell/.env values;
  // otherwise a localhost DATABASE_URL can silently target the wrong catalog.
  return { ...env, ...values, SYNC_ENV_FILE: selectedFile };
}

function acquireSyncLock(file = path.join(STATE_DIR, 'sync-write.lock')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      return { file, pid: process.pid };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      const pid = Number(owner && owner.pid);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          throw new Error(`Mzakka sync already running (pid ${pid})`);
        } catch (probeError) {
          if (probeError.code !== 'ESRCH') throw probeError;
        }
      }
      // A lock without a live owner is recoverable after a machine/process crash.
      if (attempt === 0) fs.unlinkSync(file);
    }
  }
  throw new Error('Unable to acquire Mzakka sync lock');
}

function releaseSyncLock(file, lock) {
  if (!lock || lock.file !== file || lock.pid !== process.pid) return;
  try {
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number(owner.pid) === process.pid) fs.unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function main(env = loadSyncEnvironment()) {
  const config = parseSyncConfig(env);
  const lockFile = env.SYNC_LOCK_FILE || path.join(STATE_DIR, 'sync-write.lock');
  const lock = config.writeEnabled ? acquireSyncLock(lockFile) : null;
  if (config.writeEnabled && !env.CRON_SECRET) throw new Error('CRON_SECRET is not set for a write run');
  const seen = new Set(readJson(SEEN_FILE, []));
  const discoveryState = readJson(DISCOVERY_STATE_FILE, initialState());
  const refreshState = readJson(REFRESH_STATE_FILE, initialState());
  const now = new Date();
  // The refresh timestamp lives in the refresh state. Discovery has its own
  // page cursor and must not be reset or advanced by a known-product refresh.
  const refreshExisting = shouldRefreshExisting(refreshState, config, now);
  const state = refreshExisting ? refreshState : discoveryState;
  let knownIds = seen;
  let ownedPool;
  if (refreshExisting) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required to protect ended-product refresh');
    const { Pool } = require('pg');
    ownedPool = new Pool({ connectionString: env.DATABASE_URL });
    knownIds = await loadKnownMzakkaIds(ownedPool);
  }

  try {
    const result = await runSyncAllCategories({
      leaves: loadLeaves(),
      state,
      seen,
      knownIds,
      crawl: crawlMzakkaNewItems,
      upload: config.writeEnabled ? createUpload(config, env.CRON_SECRET) : async () => {
        throw new Error('Dry-run must not upload');
      },
      persist: (currentState, currentSeen, summary) => {
        saveJsonAtomic(refreshExisting ? REFRESH_STATE_FILE : DISCOVERY_STATE_FILE, currentState);
        if (!refreshExisting) saveJsonAtomic(SEEN_FILE, [...currentSeen]);
        saveJsonAtomic(HEALTH_FILE, { ...summary, finishedAt: new Date().toISOString() });
      },
      refreshExisting,
      includeEnded: config.includeEnded,
      delayMs: config.delayMs,
      batchSize: config.batchSize,
      startLeaf: config.startLeaf,
      now,
      dryRun: !config.writeEnabled,
      maxLeaves: config.maxLeaves,
      maxPagesPerLeaf: config.maxPagesPerLeaf,
      limit: config.limit,
    });
    console.log(`SYNC_HEALTH ${JSON.stringify(result)}`);
    if (result.skippedFailed) process.exitCode = 1;
    return result;
  } finally {
    if (ownedPool) await ownedPool.end();
    if (lock) releaseSyncLock(lockFile, lock);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('FATAL:', String((error && error.message) || error));
    process.exitCode = 1;
  });
}

module.exports = {
  acquireSyncLock,
  loadKnownMzakkaIds,
  loadSyncEnvironment,
  main,
  parseSyncConfig,
  releaseSyncLock,
  shouldRefreshExisting,
};
