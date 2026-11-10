'use strict';

const TRANSIENT_DB_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'EADDRNOTAVAIL',
  'EPROTO',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08007', // transaction_resolution_unknown
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

function isRetryableDbError(error) {
  if (!error) return false;
  if (TRANSIENT_DB_CODES.has(error.code)) return true;
  return /connection terminated|connection timeout|socket hang up|server closed the connection|timeout exceeded when trying to connect|network error/i.test(
    String(error.message || error)
  );
}

function attachPoolErrorHandler(pool, logger = console) {
  // pg emits this for an idle client whose socket disappeared. It is not a
  // failed product import; discard that client and let the next checkout
  // establish a fresh connection instead of crashing the whole worker.
  pool.on('error', (error) => {
    logger.warn(`DB idle client disconnected (${String(error.code || error.message || error)}); a fresh connection will be used`);
  });
  return pool;
}

async function withDbRetry(operation, { retries = 3, baseDelayMs = 300, logger = console } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === retries) throw error;
      const delayMs = baseDelayMs * (2 ** (attempt - 1));
      logger.warn(`DB operation failed (${String(error.code || error.message || error)}); retry ${attempt}/${retries - 1} in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function queryWithRetry(pool, text, values, options) {
  return withDbRetry(() => pool.query(text, values), options);
}

module.exports = {
  attachPoolErrorHandler,
  isRetryableDbError,
  queryWithRetry,
  withDbRetry,
};
