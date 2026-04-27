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

  return cachedPool;
}

module.exports = { getConnectionString, getPool };
