#!/usr/bin/env node
/**
 * 重算 products 價格：日元（raw_payload.priceYen）→ 港幣
 * ============================================================
 * 用統一匯率（utils/currency.js：DB > env JPY_HKD_RATE > 預設 0.052），
 * 共用 utils/reprice.js，同後台「一鍵更新匯率」完全一致。
 *
 *   node scripts/recompute-prices-yen-to-hkd.js            # dry-run
 *   node scripts/recompute-prices-yen-to-hkd.js --apply    # 真正更新
 */
const { getPool } = require('../utils/getPool');
const { recomputePrices } = require('../utils/reprice');
const { jpyToHkdRate, jpyToHkdRateSource, getRuntimeRate } = require('../utils/currency');

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = getPool();
  const rate = jpyToHkdRate();

  const result = await recomputePrices(pool, rate, { apply });

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY-RUN',
    rate,
    rateSource: jpyToHkdRateSource(),
    runtimeOverride: getRuntimeRate(),
    ...result,
  }, null, 2));

  console.log(apply ? '\n已寫入資料庫。' : '\nDRY-RUN 完成。確認無誤後加 --apply 真正更新。');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
