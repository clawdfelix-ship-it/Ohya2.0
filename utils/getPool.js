const { Pool } = require('pg');

let cachedPool;
let cachedConnectionString;

function getConnectionString() {
  if (cachedConnectionString !== undefined) return cachedConnectionString;
  cachedConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
  return cachedConnectionString;
}

function getPool() {
  if (cachedPool !== undefined) return cachedPool;

  const connectionString = getConnectionString();
  if (!connectionString) {
    cachedPool = null;
    return cachedPool;
  }

  cachedPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Catch background pool errors (e.g. idle connection terminated by server)
  // Without this handler, an idle-client error becomes an unhandled exception
  // and silently kills the Vercel function instance.
  cachedPool.on('error', (err) => {
    console.error('[pool] background error (idle client):', err.message);
    // Don't destroy the pool - the next poolQuery() call will recreate the connection
  });

  return cachedPool;
}

/**
 * Wraps pool.query with one automatic retry on transient connection errors
 * (e.g. Neon free-tier cold-start drops idle clients after 5min idle).
 *
 * Returns a Promise resolving to { rows, rowCount } (same shape as pg.Pool.query).
 * On non-transient errors, throws immediately.
 */
async function poolQuery(text, params) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL not configured');

  const TRANSIENT = [
    'Connection terminated',
    'Connection terminated unexpectedly',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'EPIPE',
    'socket hang up',
    'Client has encountered a connection error',
    'Connection ended',
    'Cannot use a pool after calling end on the pool',
  ];

  function isTransient(err) {
    const msg = err && err.message ? err.message : '';
    return TRANSIENT.some(t => msg.includes(t));
  }

  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.warn('[poolQuery] transient error, retrying once:', err.message);
    // Small backoff to let the connection settle
    await new Promise(r => setTimeout(r, 200));
    return await pool.query(text, params);
  }
}

module.exports = { getConnectionString, getPool, poolQuery };