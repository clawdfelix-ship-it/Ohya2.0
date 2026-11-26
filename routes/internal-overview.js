'use strict';

/**
 * routes/internal-overview.js
 *
 * 只讀內部端點，畀中央 control-center（BFF）聚合用：
 *   GET /api/internal/admin/overview
 *
 * 認證：header `x-cc-service-token` 必須等於 process.env.CC_SERVICE_TOKEN
 *       （crypto.timingSafeEqual，先做長度預檢）。
 * 放置在 /api/internal/ 之下，所以：
 *   - 跳過 CSRF（app.js shouldSkipCsrf）
 *   - 跳過域名 308 重定向（utils/domainMigration isTechnicalPath）
 *   - 唔會被 /api/admin 嘅 admin 寫入 middleware 攔截
 *
 * 所有查詢皆為只讀，重用 app 既有嘅 Postgres pool，唔會新建連線池。
 */

const crypto = require('crypto');

function isAuthorized(provided) {
  const expected = process.env.CC_SERVICE_TOKEN;
  if (!expected || typeof provided !== 'string') return false;

  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');

  if (expectedBytes.length !== providedBytes.length) return false;

  return crypto.timingSafeEqual(expectedBytes, providedBytes);
}

// 香港時間（UTC+8）當日零時所對應嘅 UTC 瞬間
function startOfHkToday(now = new Date()) {
  const hkOffsetMs = 8 * 60 * 60 * 1000;
  const hkNow = new Date(now.getTime() + hkOffsetMs);
  const hkMidnightUtcMs = Date.UTC(
    hkNow.getUTCFullYear(),
    hkNow.getUTCMonth(),
    hkNow.getUTCDate()
  );
  return new Date(hkMidnightUtcMs - hkOffsetMs);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

module.exports = function registerInternalOverviewRoutes(app, pool) {
  app.get('/api/internal/admin/overview', async (req, res) => {
    if (!isAuthorized(req.get('x-cc-service-token'))) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!pool) {
      return res.status(503).json({ error: 'DATABASE_URL not configured' });
    }

    try {
      const todayStart = startOfHkToday();

      const [
        ordersToday,
        revenueToday,
        pendingShipment,
        outOfStock,
        proofPending,
        pendingRefunds,
        lowStock,
      ] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM orders
           WHERE created_at >= $1 AND status != 'cancelled'`,
          [todayStart]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount), 0)::float8 AS total
           FROM orders
           WHERE created_at >= $1 AND status != 'cancelled'`,
          [todayStart]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM orders
           WHERE status = 'paid'`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM (
             SELECT p.id
             FROM products p
             LEFT JOIN product_skus ps ON p.id = ps.product_id
             WHERE p.status = 'active' AND p.deleted_at IS NULL
             GROUP BY p.id
             HAVING COALESCE(SUM(ps.stock), 0) <= 0
           ) t`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM orders
           WHERE payment_status = 'proof_pending' AND status != 'cancelled'`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM refunds
           WHERE status = 'pending'`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM (
             SELECT p.id
             FROM products p
             LEFT JOIN product_skus ps ON p.id = ps.product_id
             WHERE p.status = 'active' AND p.deleted_at IS NULL
             GROUP BY p.id
             HAVING COALESCE(SUM(ps.stock), 0) <= 10
           ) t`
        ),
      ]);

      return res.status(200).json({
        slug: 'ohya',
        generatedAt: new Date().toISOString(),
        metrics: [
          {
            key: 'orders_today',
            label: '今日訂單',
            value: toNumber(ordersToday.rows[0] && ordersToday.rows[0].c),
          },
          {
            key: 'revenue_today',
            label: '今日營業額',
            value: Math.round(toNumber(revenueToday.rows[0] && revenueToday.rows[0].total) * 100) / 100,
            unit: 'HKD',
          },
          {
            key: 'pending_shipment',
            label: '待出貨訂單',
            value: toNumber(pendingShipment.rows[0] && pendingShipment.rows[0].c),
          },
          {
            key: 'out_of_stock',
            label: '缺貨商品',
            value: toNumber(outOfStock.rows[0] && outOfStock.rows[0].c),
          },
          {
            key: 'proof_pending',
            label: '待確認付款',
            value: toNumber(proofPending.rows[0] && proofPending.rows[0].c),
          },
        ],
        pending: [
          {
            id: 'pending_refunds',
            title: '待處理退款',
            count: toNumber(pendingRefunds.rows[0] && pendingRefunds.rows[0].c),
            severity: 'warning',
            href: '/admin/refunds',
          },
          {
            id: 'low_stock',
            title: '低庫存商品',
            count: toNumber(lowStock.rows[0] && lowStock.rows[0].c),
            severity: 'info',
            href: '/admin/low-stock',
          },
        ],
      });
    } catch (error) {
      console.error('internal admin overview failed', error);
      return res.status(500).json({ error: 'overview_failed' });
    }
  });
};
