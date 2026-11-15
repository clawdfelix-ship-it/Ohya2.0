'use strict';

/**
 * GA4（流量層）Measurement ID 處理。
 *
 * 設計決定（Felix 2026-11-15）：
 *  - GA4 只做流量層（page_view／流量來源／頁面類型）
 *  - 交易／漏斗層仍然只由自建 storefront_events 記錄，兩者唔混
 *  - GA4 係第三方 cookie → 必須先獲同意先會載入（consent-manager 負責）
 *  - Measurement ID 只可以由 env 提供：GA_MEASUREMENT_ID
 *  - 未設定或者格式唔啱 → 完全唔載入 GA4（靜默 no-op，唔影響頁面）
 */

const GA_MEASUREMENT_ID_RE = /^G-[A-Z0-9]{4,20}$/;

/**
 * 消毒 + 驗證 Measurement ID。
 * 合法 → 回傳乾淨嘅 ID；未設定／格式唔啱 → 回傳空字串（代表「完全唔載入 GA4」）。
 */
function normalizeMeasurementId(raw) {
  if (typeof raw !== 'string') return '';
  const id = raw.trim();
  return GA_MEASUREMENT_ID_RE.test(id) ? id : '';
}

/**
 * 產生可以直接放入 <body> 嘅 attribute 字串。
 * 未設定／格式唔啱 → 回傳空字串，令 HTML 完全唔會出現 data-ga4-id。
 */
function ga4BodyAttr(raw) {
  const id = normalizeMeasurementId(raw);
  return id ? ` data-ga4-id="${id}"` : '';
}

module.exports = {
  GA_MEASUREMENT_ID_RE,
  normalizeMeasurementId,
  ga4BodyAttr,
};
