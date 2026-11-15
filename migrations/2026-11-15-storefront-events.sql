-- P3-a 自建前台事件表（storefront events）
-- 目的：量度搜尋→商品頁 CTR、商品頁→加購率、加購→checkout 開始率、checkout→付款完成率。
--
-- 私隱紅線（刻意設計）：
--  * 冇 email、電話、地址、user_id、IP、UA 指纹、cookie 等任何識別欄位。
--  * session_id 只係前端 sessionStorage 內隨機產生嘅短 id，唔關聯帳戶。
--  * context 只准放非識別數值／短字串（白名單由 lib/analyticsEvents.js 執行時再過一次）。
--  * order_ref 係 HMAC(server secret, order_id) 截斷值：不可逆、唔係 order_id 本身，
--    只為咗將「落單→上傳證明→確認收款」三步串埋計漏斗。
--  * 資料只留 180 日（配合 scripts/apply-storefront-events-migration.js 嘅 --prune 選項定時清）。
--
-- 呢個 migration 淨係加表加索引，唔會改 orders / products / payments 任何既有資料。

BEGIN;

CREATE TABLE IF NOT EXISTS storefront_events (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_name    TEXT        NOT NULL,   -- view | search | add_to_cart | checkout_start | payment_proof | paid
  product_id    INTEGER,                -- 只記商品 ID，唔記任何個人資料
  step          TEXT,                   -- 同一事件內嘅語意細分
  page_type     TEXT,                   -- product | listing | guide | cart | order | other
  category      TEXT,                   -- 分類名（前台 slug 或名，非識別）
  referrer_type TEXT,                   -- direct | google | search | social | internal | other
  session_id    TEXT,                   -- 隨機 session id（唔關聯帳戶）
  order_ref     TEXT,                   -- HMAC(server secret, order_id) 截斷值（不可逆，非 PII）
  context       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storefront_events_event_name_check
    CHECK (event_name IN ('view','search','add_to_cart','checkout_start','payment_proof','paid')),
  CONSTRAINT storefront_events_referrer_type_check
    CHECK (referrer_type IS NULL OR referrer_type IN ('direct','google','search','social','internal','other')),
  CONSTRAINT storefront_events_page_type_check
    CHECK (page_type IS NULL OR page_type IN ('product','listing','guide','cart','order','other'))
);

CREATE INDEX IF NOT EXISTS idx_storefront_events_ts ON storefront_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_event_ts ON storefront_events (event_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_session ON storefront_events (session_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_product ON storefront_events (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_events_order_ref ON storefront_events (order_ref, ts DESC) WHERE order_ref IS NOT NULL;

COMMENT ON TABLE storefront_events IS
  '自建前台事件（無 PII）。只記商品 ID 同步驟；session_id 為隨機 id；order_key 為不可逆 HMAC。';
COMMENT ON COLUMN storefront_events.session_id IS
  '前端 sessionStorage 隨機 id，唔關聯用戶帳戶，唔係 cookie 值。';
COMMENT ON COLUMN storefront_events.context IS
  '只准非識別數值／短字串；執行時由 lib/analyticsEvents.js 白名單過濾。';
COMMENT ON COLUMN storefront_events.order_ref IS
  'HMAC(server secret, order_id) 截斷 32 hex；不可逆，只用嚟 join order 級事件（checkout_start → payment_proof → paid）。';

-- 保留資料：只留 180 日
DELETE FROM storefront_events WHERE ts < NOW() - INTERVAL '180 days';

COMMIT;
