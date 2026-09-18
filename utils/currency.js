/**
 * 貨幣換算（單一真相源）
 * ---------------------------------------------
 * 上游 mzakka 商品價格係日元（JPY）。本店以港幣（HKD）標價：
 *   - DB products.price            單位 = HKD 元（DECIMAL）
 *   - 前台 storefront product.price 單位 = HKD 仙（cents，HKD 元 × 100）
 *
 * 匯率用環境變數 JPY_HKD_RATE 控制（1 日元兌多少港幣），
 * 預設 0.052（100 円 ≈ HK$5.2）。要加定價/利潤就調高 env，唔好寫死喺碼。
 */

const DEFAULT_JPY_HKD_RATE = 0.052;

function jpyToHkdRate() {
  const raw = process.env.JPY_HKD_RATE;
  const parsed = raw !== undefined && raw !== '' ? parseFloat(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_JPY_HKD_RATE;
}

/** 日元（元）→ 港幣（元），四捨五入到 2 位小數 */
function yenToHkd(yen, rate) {
  const y = Number(yen);
  if (!Number.isFinite(y) || y <= 0) return 0;
  const r = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : jpyToHkdRate();
  return Math.round(y * r * 100) / 100;
}

/** 日元（元）→ 港幣仙（cents），整數 */
function yenToHkdCents(yen, rate) {
  const y = Number(yen);
  if (!Number.isFinite(y) || y <= 0) return 0;
  const r = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : jpyToHkdRate();
  return Math.round(y * r * 100);
}

module.exports = {
  DEFAULT_JPY_HKD_RATE,
  jpyToHkdRate,
  yenToHkd,
  yenToHkdCents,
};
