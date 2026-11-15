// ===========================================
// Storefront Analytics API（P3-a）
// - POST /api/analytics/event        : public，fail-open 收事件
// - GET  /api/admin/analytics/funnel : admin 唯讀漏斗報告
// ===========================================
//
// 私隱紅線：
//  - 只收 event / product_id / step / page_type / category / referrer_type / session_id / context
//  - 唔收 email、IP、user id、UA 指紋、cookie；context 有白名單 + PII 黑名單
//  - 唔加第三方 tracker；全部事件自己寫入 storefront_events
//  - 寫入失敗一律 fail-open，永遠唔影響下單 / 頁面載入

const {
  validateEvent,
  recordEvent,
  orderRef,
  buildFunnelQuery,
} = require('../lib/analyticsEvents');
const { createAnalyticsEventLimiter } = require('../utils/security/rateLimiters');

const MAX_BODY_BYTES = 4 * 1024; // 單一事件最大 4KB

function pickReferrerType(value) {
  const v = String(value || '').trim();
  return /^[a-z_]{1,20}$/.test(v) ? v : null;
}

function pickSessionId(value) {
  const v = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

function round(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10000) / 10000;
}

module.exports = function(app, pool) {
  const { requirePermission } = require('./middleware/auth');

  // Rate limiter 要喺 app 初始化時建立（process-local，serverless 唔係 global quota）
  const eventLimiter = createAnalyticsEventLimiter();

  // ---------------------------------------------------------------
  // POST /api/analytics/event
  // Public：唔需要登入。CSRF 已經喺 app.js shouldSkipCsrf 加 '/api/analytics' 略過。
  // 永遠 fail-open：成功 202、payload 唔合法 400、DB 錯都唔會 5xx。
  // ---------------------------------------------------------------
  app.post('/api/analytics/event', eventLimiter, (req, res) => {
    try {
      // body 太大就唔理（唔會 throw）
      const raw = req.body;
      if (raw === undefined || raw === null) return res.status(400).json({ ok: false, error: 'empty body' });
      if (typeof raw === 'string' && raw.length > MAX_BODY_BYTES) {
        return res.status(400).json({ ok: false, error: 'payload too large' });
      }
      if (Buffer.isBuffer(raw) && raw.length > MAX_BODY_BYTES) {
        return res.status(400).json({ ok: false, error: 'payload too large' });
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const approx = JSON.stringify(raw).length;
        if (approx > MAX_BODY_BYTES) return res.status(400).json({ ok: false, error: 'payload too large' });
      }

      const result = validateEvent(raw);
      if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });

      // fail-open：recordEvent 內部已 try/catch，呢度再包多一重保險
      Promise.resolve(recordEvent(pool, result.event)).catch(() => {});
      return res.status(202).json({ ok: true });
    } catch (_) {
      // fail-open：就算中間出錯都唔會影響客人
      try {
        return res.status(202).json({ ok: true });
      } catch (_e) {
        return;
      }
    }
  });

  // ---------------------------------------------------------------
  // GET /api/admin/analytics/funnel
  // Admin 唯讀報告：逐日 / 逐來源
  //   1) 搜尋→商品頁 CTR
  //   2) 商品頁→加購率
  //   3) 加購→checkout 開始率
  //   4) checkout→付款完成率（order_ref join）
  // ---------------------------------------------------------------
  app.get('/api/admin/analytics/funnel', requirePermission('reports:read'), async (req, res) => {
    try {
      const days = req.query.days;
      const sourceFilter = String(req.query.source || 'all').trim().toLowerCase();
      const { safeDays, sql, orderSql } = buildFunnelQuery(days);

      const sessionRes = await pool.query(sql, [String(safeDays)]);
      const orderRes = await pool.query(orderSql, [String(safeDays)]);

      const keep = (rows) =>
        (rows || []).filter(
          (r) => sourceFilter === 'all' || String(r.source || '').toLowerCase() === sourceFilter
        );

      const sessions = keep(sessionRes.rows);
      const orders = keep(orderRes.rows);

      const byDay = {};
      const bySource = {};

      const ensure = (bucket, key) => {
        if (!bucket[key]) {
          bucket[key] = {
            sessions: 0,
            search_sessions: 0,
            search_to_view_sessions: 0,
            view_sessions: 0,
            view_to_cart_sessions: 0,
            cart_sessions: 0,
            cart_to_checkout_sessions: 0,
            checkout_sessions: 0,
            orders_created: 0,
            orders_with_proof: 0,
            orders_paid: 0,
          };
        }
        return bucket[key];
      };

      for (const r of sessions) {
        const day = String(r.day);
        const src = String(r.source || 'direct');
        for (const target of [ensure(byDay, day), ensure(bySource, src)]) {
          target.sessions += Number(r.sessions || 0);
          target.search_sessions += Number(r.search_sessions || 0);
          target.search_to_view_sessions += Number(r.search_to_view_sessions || 0);
          target.view_sessions += Number(r.view_sessions || 0);
          target.view_to_cart_sessions += Number(r.view_to_cart_sessions || 0);
          target.cart_sessions += Number(r.cart_sessions || 0);
          target.cart_to_checkout_sessions += Number(r.cart_to_checkout_sessions || 0);
          target.checkout_sessions += Number(r.checkout_sessions || 0);
        }
      }
      for (const r of orders) {
        const day = String(r.day);
        const src = String(r.source || 'direct');
        for (const target of [ensure(byDay, day), ensure(bySource, src)]) {
          target.orders_created += Number(r.orders_created || 0);
          target.orders_with_proof += Number(r.orders_with_proof || 0);
          target.orders_paid += Number(r.orders_paid || 0);
        }
      }

      const withRates = (bucket) => {
        const out = {};
        for (const key of Object.keys(bucket)) {
          const b = bucket[key];
          out[key] = Object.assign({}, b, {
            // 搜尋→商品頁 CTR
            search_to_view_rate: round(b.search_sessions ? b.search_to_view_sessions / b.search_sessions : 0),
            // 商品頁→加購率
            view_to_cart_rate: round(b.view_sessions ? b.view_to_cart_sessions / b.view_sessions : 0),
            // 加購→checkout 開始率
            cart_to_checkout_rate: round(b.cart_sessions ? b.cart_to_checkout_sessions / b.cart_sessions : 0),
            // checkout→付款完成率（order 級）
            checkout_to_paid_rate: round(b.orders_created ? b.orders_paid / b.orders_created : 0),
          });
        }
        return out;
      };

      const totals = {};
      for (const key of Object.keys(byDay)) {
        const b = byDay[key];
        if (!totals.sessions) {
          totals.sessions = 0;
          totals.search_sessions = 0;
          totals.search_to_view_sessions = 0;
          totals.view_sessions = 0;
          totals.view_to_cart_sessions = 0;
          totals.cart_sessions = 0;
          totals.cart_to_checkout_sessions = 0;
          totals.checkout_sessions = 0;
          totals.orders_created = 0;
          totals.orders_with_proof = 0;
          totals.orders_paid = 0;
        }
        for (const k of Object.keys(totals)) totals[k] += Number(b[k] || 0);
      }
      const totalsOut = Object.assign({}, totals, {
        search_to_view_rate: round(totals.search_sessions ? totals.search_to_view_sessions / totals.search_sessions : 0),
        view_to_cart_rate: round(totals.view_sessions ? totals.view_to_cart_sessions / totals.view_sessions : 0),
        cart_to_checkout_rate: round(totals.cart_sessions ? totals.cart_to_checkout_sessions / totals.cart_sessions : 0),
        checkout_to_paid_rate: round(totals.orders_created ? totals.orders_paid / totals.orders_created : 0),
      });

      return res.json({
        ok: true,
        days: safeDays,
        source: sourceFilter,
        totals: totalsOut,
        by_day: withRates(byDay),
        by_source: withRates(bySource),
        notes: {
          search_to_view_rate: '搜尋→商品頁 CTR（同一 session 先 search 後 view）',
          view_to_cart_rate: '商品頁→加購率（同一 session 先 view 後 add_to_cart）',
          cart_to_checkout_rate: '加購→checkout 開始率（同一 session 先 add_to_cart 後 checkout_start）',
          checkout_to_paid_rate: 'checkout→付款完成率（order_ref join：checkout_start→paid）',
        },
      });
    } catch (err) {
      // 報告讀唔到唔應該 500 得太難睇，但呢度係 admin 讀取，需要知道出咗事
      console.error('[analytics] funnel report failed:', err && err.message);
      return res.status(500).json({ ok: false, error: 'funnel query failed' });
    }
  });

  // ---------------------------------------------------------------
  // Server-side 事件 helper（供 routes/orders.js / routes/logistics.js 呼叫）
  // - order_ref = HMAC(order_id)，用嚟 join checkout_start → payment_proof → paid
  // - session_id / referrer_type 沿用落單時 client 傳上嚟嘅非識別 metadata
  // - 完全 fail-open，唔會影響下單 / 收款流程
  // ---------------------------------------------------------------
  async function recordOrderEvent({
    orderId,
    event,
    step,
    sessionId,
    referrerType,
    productId,
    category,
    context,
  }) {
    try {
      const ref = orderRef(orderId);
      const ev = {
        event,
        step: step || null,
        product_id: productId == null ? null : Number(productId) || null,
        page_type: 'order',
        category: category || null,
        referrer_type: pickReferrerType(referrerType),
        session_id: pickSessionId(sessionId),
        order_ref: ref,
        context: Object.assign({}, context || {}, ref ? { order_ref: ref } : {}),
      };
      return await recordEvent(pool, ev);
    } catch (_) {
      return false;
    }
  }

  // 從 order_ref 反查 session_id / referrer_type（server-side paid 事件想沿用來源）
  async function lookupOrderAttribution(orderId) {
    try {
      const ref = orderRef(orderId);
      if (!ref) return { session_id: null, referrer_type: null };
      const r = await pool.query(
        `SELECT session_id, referrer_type
           FROM storefront_events
          WHERE order_ref = $1
          ORDER BY ts ASC
          LIMIT 1`,
        [ref]
      );
      const row = (r.rows || [])[0] || {};
      return {
        session_id: pickSessionId(row.session_id),
        referrer_type: pickReferrerType(row.referrer_type),
      };
    } catch (_) {
      return { session_id: null, referrer_type: null };
    }
  }

  app.locals.analytics = { recordOrderEvent, lookupOrderAttribution, orderRef };
  // routes/orders.js / routes/logistics.js 會用 app.locals.analytics
};
