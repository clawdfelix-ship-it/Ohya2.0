'use strict';

const crypto = require('crypto');

/**
 * 自建、冇第三方 tracker 嘅前台事件（storefront events）。
 *
 * 私隱原則（硬性）：
 *  - 只記商品 ID 同埋「步驟」，唔記任何可直接識別個人嘅資料。
 *  - 唔收 email、電話、地址、user id、IP、UA 指纹、cookie 值。
 *  - session_id 係瀏覽器 sessionStorage 內隨機產生嘅短 id，唔關聯任何帳戶。
 *  - context 只接受白名單 key 同純數值／短字串。
 *  - 寫入失敗一定 fail-open（唔影響下單、唔影響頁面載入）。
 */

// 事件白名單（業務漏斗：view → search → add_to_cart → checkout_start → payment_proof → paid）
const ALLOWED_EVENTS = Object.freeze([
  'view',
  'search',
  'add_to_cart',
  'checkout_start',
  'payment_proof',
  'paid',
]);

// step 係同一事件內嘅語意細分，幫手分辨「點擊開始結帳」同「成功落單」
const ALLOWED_STEPS = Object.freeze([
  'product_view',
  'listing_view',
  'search_results',
  'guide_view',
  'guide_cta_click',
  'add_to_cart',
  'checkout_click',
  'order_created',
  'proof_uploaded',
  'payment_confirmed',
]);

const ALLOWED_REFERRER_TYPES = Object.freeze(['direct', 'google', 'search', 'social', 'internal', 'other']);
const ALLOWED_PAGE_TYPES = Object.freeze(['product', 'listing', 'guide', 'cart', 'order', 'other']);

// context 白名單（全部非識別）
const ALLOWED_CONTEXT_KEYS = Object.freeze([
  'result_count',
  'item_count',
  'quantity',
  'page_number',
  'position',
  'list_name',
  'query_len',
  // 訂單級 join key：HMAC(server secret, order_id) 截斷值，唔係 order_id 本身
  'order_ref',
  // 流量來源（逐來源漏斗）：只准有限字元，唔准夾帶 PII
  'utm_source',
  'utm_medium',
  'utm_campaign',
]);

// utm 相關 context key（值會被消毒：只留 [A-Za-z0-9_\-.]，最多 64 字元）
const UTM_CONTEXT_KEYS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign']);

// 明文禁止嘅欄位（就算前端送都會丟棄）
const FORBIDDEN_KEYS = Object.freeze([
  'email',
  'e_mail',
  'mail',
  'phone',
  'tel',
  'contact',
  'contact_name',
  'contact_phone',
  'contact_address',
  'address',
  'name',
  'user_id',
  'userid',
  'userId',
  'uid',
  'ip',
  'ip_address',
  'remote_addr',
  'user_agent',
  'useragent',
  'ua',
  'fingerprint',
  'cookie',
  'token',
  'session',
  'password',
  'order_id',
  'orderId',
  'customer_id',
  'customerId',
]);

// 明確嘅識別欄位 suffix pattern（例如 billing_email、buyer_phone、client_ip）
const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /(^|_)email$/,
  /(^|_)phone$/,
  /(^|_)address$/,
  /(^|_)ip$/,
  /(^|_)ua$/,
  /(^|_)agent$/,
  /(^|_)fingerprint$/,
  /(^|_)token$/,
  /(^|_)cookie$/,
  /(^|_)password$/,
  /(^|_)user_id$/,
  /(^|_)order_id$/,
  /(^|_)customer_id$/,
]);

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CATEGORY_RE = /^[A-Za-z0-9_\-\u3400-\u9FFF]{1,64}$/;
const MAX_CONTEXT_STRING = 64;
// utm 值只准 [A-Za-z0-9_\-.]（其他字元剝走），上限 64
const UTM_VALUE_RE = /[^A-Za-z0-9_\-.]/g;
const MAX_CONTEXT_KEYS = 12;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function containsForbiddenKey(key) {
  const k = String(key || '').toLowerCase();
  if (!k) return false;
  // exact match（避免 "quantity" 含 "ua"、"session_id" 含 "session" 咁誤殺）
  if (FORBIDDEN_KEYS.some((f) => k === f.toLowerCase())) return true;
  // suffix pattern（例如 billing_email、client_ip）
  return FORBIDDEN_KEY_PATTERNS.some((re) => re.test(k));
}

function clampString(value, max) {
  const s = String(value == null ? '' : value).trim();
  return s.slice(0, max);
}

/**
 * utm 消毒：剝走所有唔准嘅字元（只留 A-Z a-z 0-9 _ - .），上限 64 字元。
 * 消毒後變空 → 回傳 null（唔記錄）。
 */
function sanitizeUtmValue(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(UTM_VALUE_RE, '').slice(0, MAX_CONTEXT_STRING);
  return cleaned ? cleaned : null;
}

/**
 * 驗證 + 消毒單一事件。
 * 回傳 { ok: true, event } 或 { ok: false, reason }。
 * 未知事件名會被拒絕（避免有人塞任意資料入表）。
 */
function validateEvent(payload) {
  if (!isPlainObject(payload)) return { ok: false, reason: 'payload must be an object' };

  const event = String(payload.event || payload.event_name || '').trim();
  if (!event) return { ok: false, reason: 'event is required' };
  if (!ALLOWED_EVENTS.includes(event)) return { ok: false, reason: 'unsupported event' };

  const out = { event };

  if (payload.product_id !== undefined && payload.product_id !== null && payload.product_id !== '') {
    const pid = parseInt(payload.product_id, 10);
    if (!Number.isInteger(pid) || pid <= 0) return { ok: false, reason: 'invalid product_id' };
    out.product_id = pid;
  } else {
    out.product_id = null;
  }

  if (payload.step !== undefined && payload.step !== null && payload.step !== '') {
    const step = String(payload.step).trim();
    if (!ALLOWED_STEPS.includes(step)) return { ok: false, reason: 'unsupported step' };
    out.step = step;
  } else {
    out.step = null;
  }

  if (payload.page_type !== undefined && payload.page_type !== null && payload.page_type !== '') {
    const pageType = String(payload.page_type).trim();
    if (!ALLOWED_PAGE_TYPES.includes(pageType)) return { ok: false, reason: 'unsupported page_type' };
    out.page_type = pageType;
  } else {
    out.page_type = null;
  }

  if (payload.referrer_type !== undefined && payload.referrer_type !== null && payload.referrer_type !== '') {
    const ref = String(payload.referrer_type).trim();
    if (!ALLOWED_REFERRER_TYPES.includes(ref)) return { ok: false, reason: 'unsupported referrer_type' };
    out.referrer_type = ref;
  } else {
    out.referrer_type = null;
  }

  if (payload.category !== undefined && payload.category !== null && payload.category !== '') {
    const category = String(payload.category).trim();
    if (!CATEGORY_RE.test(category)) return { ok: false, reason: 'invalid category' };
    out.category = category;
  } else {
    out.category = null;
  }

  if (payload.session_id !== undefined && payload.session_id !== null && payload.session_id !== '') {
    const sid = String(payload.session_id).trim();
    if (!SESSION_ID_RE.test(sid)) return { ok: false, reason: 'invalid session_id' };
    out.session_id = sid;
  } else {
    out.session_id = null;
  }

  const context = {};
  if (isPlainObject(payload.context)) {
    let kept = 0;
    for (const key of Object.keys(payload.context)) {
      if (kept >= MAX_CONTEXT_KEYS) break;
      if (containsForbiddenKey(key)) continue;
      if (!ALLOWED_CONTEXT_KEYS.includes(key)) continue;
      const value = payload.context[key];
      if (UTM_CONTEXT_KEYS.includes(key)) {
        // utm 只准字串 + 消毒後值；數值／boolean 一律唔記
        const utm = sanitizeUtmValue(value);
        if (utm) context[key] = utm;
        continue;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        context[key] = value;
      } else if (typeof value === 'boolean') {
        context[key] = value;
      } else if (typeof value === 'string') {
        context[key] = clampString(value, MAX_CONTEXT_STRING);
      } else {
        continue;
      }
      kept += 1;
    }
  }
  out.context = context;

  // 最終防線：任何殘留 PII key 一律唔准留低
  for (const key of Object.keys(out)) {
    if (containsForbiddenKey(key)) delete out[key];
  }
  if (out.context) {
    for (const key of Object.keys(out.context)) {
      if (containsForbiddenKey(key)) delete out.context[key];
    }
  }

  return { ok: true, event: out };
}

/**
 * 訂單級事件嘅 join key。
 * HMAC-SHA256(server secret, order_id) 截斷 32 hex：
 *  - 不可逆（冇 secret 冇辦法由 order_ref 反推 order_id）
 *  - 唔係 order_id / 唔係 email / 唔會直接識別個人
 *  - secret 輪換後舊 order_ref 會對唔上（歷史事件仍然保留，只係 join 斷鏈）
 */
function orderRef(orderId) {
  if (orderId === undefined || orderId === null || orderId === '') return null;
  const secret = process.env.ANALYTICS_ORDER_REF_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-secret';
  try {
    return crypto
      .createHmac('sha256', String(secret))
      .update(String(orderId))
      .digest('hex')
      .slice(0, 32);
  } catch (_) {
    return null;
  }
}

/**
 * 寫入一條事件。永遠 fail-open：任何錯誤都唔會拋出、唔會影響呼叫端。
 */
async function recordEvent(pool, event, extra) {
  if (!pool || !event || !event.event) return false;
  try {
    const context = Object.assign({}, event.context || {}, extra && extra.context ? extra.context : {});
    const result = await pool.query(
      `INSERT INTO storefront_events
         (event_name, product_id, step, page_type, category, referrer_type, session_id, order_ref, context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        event.event,
        event.product_id == null ? null : event.product_id,
        event.step == null ? null : event.step,
        event.page_type == null ? null : event.page_type,
        event.category == null ? null : event.category,
        event.referrer_type == null ? null : event.referrer_type,
        event.session_id == null ? null : event.session_id,
        event.order_ref == null ? null : event.order_ref,
        JSON.stringify(context),
      ]
    );
    return !!(result && result.rowCount >= 0);
  } catch (err) {
    // fail-open：表未建立／DB 抖／超時都唔可以影響客人流程
    try {
      console.warn('[analytics] event dropped (fail-open):', err && err.message);
    } catch (_) {}
    return false;
  }
}

/**
 * 漏斗報告 SQL：兩層
 *  1) session 級（client-side 事件）：搜尋→商品頁 CTR、商品頁→加購率、加購→checkout 開始率
 *  2) order 級（server-side 事件，用 order_ref join）：checkout→付款完成率
 * 只讀，唔會寫入。
 */
function buildFunnelQuery(days) {
  const safeDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 180);
  return {
    safeDays,
    // session 級漏斗
    sql: `
WITH sess AS (
  SELECT session_id,
         DATE_TRUNC('day', MIN(ts)) AS day,
         MIN(ts) FILTER (WHERE event_name = 'search')                          AS t_search,
         MIN(ts) FILTER (WHERE event_name = 'view')                            AS t_view,
         MIN(ts) FILTER (WHERE event_name = 'add_to_cart')                     AS t_cart,
         MIN(ts) FILTER (WHERE event_name = 'checkout_start' AND step = 'checkout_click') AS t_checkout,
         COALESCE(
           (ARRAY_AGG(NULLIF(referrer_type, 'internal') ORDER BY ts)
              FILTER (WHERE referrer_type IS NOT NULL AND referrer_type <> 'internal'))[1],
           'direct'
         ) AS source
  FROM storefront_events
  WHERE ts >= NOW() - ($1 || ' days')::interval
    AND session_id IS NOT NULL
    AND event_name IN ('search','view','add_to_cart','checkout_start')
  GROUP BY session_id
)
SELECT day::date AS day,
       source,
       COUNT(*)::int AS sessions,
       COUNT(*) FILTER (WHERE t_search IS NOT NULL)::int AS search_sessions,
       COUNT(*) FILTER (WHERE t_search IS NOT NULL AND t_view IS NOT NULL AND t_view > t_search)::int AS search_to_view_sessions,
       COUNT(*) FILTER (WHERE t_view IS NOT NULL)::int AS view_sessions,
       COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart IS NOT NULL AND t_cart > t_view)::int AS view_to_cart_sessions,
       COUNT(*) FILTER (WHERE t_cart IS NOT NULL)::int AS cart_sessions,
       COUNT(*) FILTER (WHERE t_cart IS NOT NULL AND t_checkout IS NOT NULL AND t_checkout > t_cart)::int AS cart_to_checkout_sessions,
       COUNT(*) FILTER (WHERE t_checkout IS NOT NULL)::int AS checkout_sessions
  FROM sess
 GROUP BY day, source
 ORDER BY day ASC, source ASC`,
    // order 級漏斗（order_ref join）
    orderSql: `
WITH ord AS (
  SELECT order_ref,
         DATE_TRUNC('day', MIN(ts) FILTER (WHERE event_name = 'checkout_start')) AS day,
         MIN(ts) FILTER (WHERE event_name = 'checkout_start') AS t_created,
         MIN(ts) FILTER (WHERE event_name = 'payment_proof')  AS t_proof,
         MIN(ts) FILTER (WHERE event_name = 'paid')           AS t_paid,
         COALESCE(
           (ARRAY_AGG(NULLIF(referrer_type, 'internal') ORDER BY ts)
              FILTER (WHERE referrer_type IS NOT NULL AND referrer_type <> 'internal'))[1],
           'direct'
         ) AS source
  FROM storefront_events
  WHERE ts >= NOW() - ($1 || ' days')::interval
    AND order_ref IS NOT NULL
    AND event_name IN ('checkout_start','payment_proof','paid')
  GROUP BY order_ref
)
SELECT day::date AS day,
       source,
       COUNT(*)::int AS orders_created,
       COUNT(*) FILTER (WHERE t_proof IS NOT NULL AND t_proof > t_created)::int AS orders_with_proof,
       COUNT(*) FILTER (WHERE t_paid IS NOT NULL AND t_paid > t_created)::int AS orders_paid
  FROM ord
 WHERE t_created IS NOT NULL
 GROUP BY day, source
 ORDER BY day ASC, source ASC`,
  };
}

module.exports = {
  ALLOWED_EVENTS,
  ALLOWED_STEPS,
  ALLOWED_REFERRER_TYPES,
  ALLOWED_PAGE_TYPES,
  ALLOWED_CONTEXT_KEYS,
  UTM_CONTEXT_KEYS,
  FORBIDDEN_KEYS,
  SESSION_ID_RE,
  sanitizeUtmValue,
  orderRef,
  validateEvent,
  recordEvent,
  buildFunnelQuery,
};
