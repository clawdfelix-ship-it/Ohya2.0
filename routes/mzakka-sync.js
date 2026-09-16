module.exports = function registerMzakkaSyncRoutes(app, pool) {
  const { requirePermission } = require('./middleware/auth');
  const { normalizeSyncOptions, syncMzakkaNewItemsToDb } = require('../utils/mzakkaSync');

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
      const options = normalizeSyncOptions(req.body || {});
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

  app.post('/api/admin/catalog/mzakka-sync', requirePermission('catalog:write'), async (req, res) => {
    await handleSync(req, res, 'admin');
  });

  app.post('/api/internal/jobs/mzakka-sync', async (req, res) => {
    const expected = process.env.MZAKKA_SYNC_SECRET;
    if (!expected) {
      return res.status(503).json({ error: 'MZAKKA_SYNC_SECRET not configured' });
    }
    const provided = getSyncSecretFromRequest(req);
    if (!provided || provided !== expected) {
      return res.status(401).json({ error: 'Invalid sync secret' });
    }
    await handleSync(req, res, 'internal');
  });
};
