module.exports = function registerMzakkaSyncRoutes(app, pool) {
  const { requirePermission } = require('./middleware/auth');
  const { normalizeSyncOptions, syncMzakkaNewItemsToDb } = require('../utils/mzakkaSync');

  function getConfiguredSyncSecrets() {
    return Array.from(new Set(
      [process.env.MZAKKA_SYNC_SECRET, process.env.CRON_SECRET]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    ));
  }

  function getSyncSecretFromRequest(req) {
    const headerSecret = req.get('x-sync-secret');
    if (headerSecret) return String(headerSecret);
    const auth = req.get('authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1]) : '';
  }

  function ensurePool(res) {
    if (pool) return true;
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return false;
  }

  async function handleSync(req, res, source) {
    if (!ensurePool(res)) return;
    try {
      const options = normalizeSyncOptions({
        ...(req.query || {}),
        ...(req.body || {}),
      });
      const result = await syncMzakkaNewItemsToDb({
        pool,
        ...options,
      });
      res.json({ ok: true, source, result });
    } catch (err) {
      console.error('Mzakka sync failed:', err);
      res.status(500).json({
        ok: false,
        error: String((err && err.message) || err),
      });
    }
  }

  function ensureInternalSyncAuthorized(req, res) {
    const expectedSecrets = getConfiguredSyncSecrets();
    if (expectedSecrets.length === 0) {
      res.status(503).json({ error: 'MZAKKA_SYNC_SECRET or CRON_SECRET not configured' });
      return false;
    }
    const provided = getSyncSecretFromRequest(req);
    if (!provided || !expectedSecrets.includes(provided)) {
      res.status(401).json({ error: 'Invalid sync secret' });
      return false;
    }
    return true;
  }

  app.post('/api/admin/catalog/mzakka-sync', requirePermission('catalog:write'), async (req, res) => {
    await handleSync(req, res, 'admin');
  });

  async function handleInternalSync(req, res) {
    if (!ensureInternalSyncAuthorized(req, res)) return;
    await handleSync(req, res, 'internal');
  }

  app.get('/api/internal/jobs/mzakka-sync', handleInternalSync);
  app.post('/api/internal/jobs/mzakka-sync', handleInternalSync);
};
