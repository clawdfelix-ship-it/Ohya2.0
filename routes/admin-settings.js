/**
 * 後台設定：JPY→HKD 匯率（一鍵更新）
 *  - GET  /api/admin/settings/exchange-rate        睇現行匯率/來源/影響商品數
 *  - POST /api/admin/settings/exchange-rate/fetch  拉線上最新匯率（可選重算全店價格）
 *  - POST /api/admin/settings/exchange-rate/manual 手動設匯率（可選重算）
 *
 * 匯率一經更新寫入 app_settings 並同步 runtime；recompute=true 時順手重算
 * 所有 source='mzakka' 商品（由 raw_payload.priceYen）。
 */
const { getSetting, setSetting } = require('../utils/settings');
const {
  jpyToHkdRate,
  jpyToHkdRateSource,
  setRuntimeRate,
} = require('../utils/currency');
const { recomputePrices, fetchLiveJpyHkdRate } = require('../utils/reprice');

const RATE_KEY = 'jpy_hkd_rate';

function rateIsValid(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1; // 1 JPY 一定 < 1 HKD，擋明顯錯誤
}

module.exports = function (app, pool, requireAdmin) {
  // 現行匯率狀態
  app.get('/api/admin/settings/exchange-rate', requireAdmin, async (req, res) => {
    try {
      const stored = await getSetting(pool, RATE_KEY);
      const countRes = await pool.query(
        "SELECT COUNT(*)::int AS n FROM products WHERE source = 'mzakka'"
      );
      res.json({
        rate: jpyToHkdRate(),
        source: jpyToHkdRateSource(),
        storedRate: stored && stored.value !== null ? Number(stored.value) : null,
        updatedAt: stored ? stored.updated_at : null,
        affectedProducts: countRes.rows[0].n,
      });
    } catch (err) {
      console.error('GET exchange-rate settings failed:', err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // 共用：保存匯率 + 選擇性重算
  async function saveRate(req, res, rate) {
    if (!rateIsValid(rate)) {
      return res.status(400).json({ error: '匯率無效，請輸入 0 至 1 之間嘅數字（例如 0.052）' });
    }
    const recompute = req.body && req.body.recompute !== false;
    let repriceResult = null;

    // 1) 先存匯率並即時同步 runtime（失敗就整單中斷）
    const saved = await setSetting(pool, RATE_KEY, Number(rate), req.session.userId);
    setRuntimeRate(Number(rate));

    // 2) 可選：同一 transaction 重算全店價格（失敗 rollback，但新匯率仍保留）
    if (recompute) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        repriceResult = await recomputePrices(client, Number(rate), { apply: true });
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    }

    res.json({
      success: true,
      rate: Number(rate),
      source: 'db',
      updatedAt: saved.updated_at,
      recomputed: recompute,
      reprice: repriceResult,
    });
  }

  // 一鍵：拉線上最新匯率
  app.post('/api/admin/settings/exchange-rate/fetch', requireAdmin, async (req, res) => {
    try {
      const live = await fetchLiveJpyHkdRate();
      return saveRate(req, res, live.rate, live);
    } catch (err) {
      console.error('Fetch live rate failed:', err);
      return res.status(502).json({ error: '取得線上匯率失敗：' + (err.message || '未知錯誤') });
    }
  });

  // 手動設定
  app.post('/api/admin/settings/exchange-rate/manual', requireAdmin, async (req, res) => {
    const rate = req.body && req.body.rate;
    return saveRate(req, res, rate);
  });
};
