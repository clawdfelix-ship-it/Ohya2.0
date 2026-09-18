#!/usr/bin/env node
/**
 * 重算 products 價格：日元（raw_payload.priceYen）→ 港幣
 * ============================================================
 * 歷史問題：mzakka 匯入時將日元數字原封塞入 products.price（零匯率），
 * 前台又 ×100 當 cents，令標價錯位約 19 倍。此腳本用統一匯率
 * （utils/currency.js，env JPY_HKD_RATE，預設 0.052）重算。
 *
 * 預設 DRY-RUN，只列變更唔寫庫。真正執行加 --apply。
 *
 *   node scripts/recompute-prices-yen-to-hkd.js            # dry-run
 *   node scripts/recompute-prices-yen-to-hkd.js --apply    # 真正更新
 *
 * 只處理 source='mzakka' 且 raw_payload 有 priceYen 嘅列；其餘跳過。
 */
const { getPool } = require('../utils/getPool');
const { yenToHkd, jpyToHkdRate } = require('../utils/currency');

async function main() {
  const apply = process.argv.includes('--apply');
  const rate = jpyToHkdRate();
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT id, name, price, original_price, source, raw_payload
    FROM products
    WHERE source = 'mzakka'
    ORDER BY id
  `);

  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  const examples = [];

  for (const r of rows) {
    scanned++;
    let yen = null;
    try {
      yen = r.raw_payload && Number.isFinite(Number(r.raw_payload.priceYen))
        ? Number(r.raw_payload.priceYen)
        : null;
    } catch (_) { yen = null; }

    if (!yen || yen <= 0) { skipped++; continue; }

    const newPrice = yenToHkd(yen, rate);
    const origYen = r.raw_payload && Number.isFinite(Number(r.raw_payload.originalPriceYen))
      ? Number(r.raw_payload.originalPriceYen)
      : null;
    const newOrig = origYen ? yenToHkd(origYen, rate) : null;

    const priceChanged = Number(r.price) !== newPrice ||
      (newOrig !== null && Number(r.original_price || 0) !== newOrig);

    if (priceChanged) changed++;
    if (examples.length < 10) {
      examples.push({
        id: r.id,
        yen,
        old: Number(r.price),
        new: newPrice,
        willUpdate: priceChanged,
      });
    }

    if (apply && priceChanged) {
      await pool.query(
        'UPDATE products SET price = $1, original_price = $2, updated_at = NOW() WHERE id = $3',
        [newPrice, newOrig, r.id]
      );
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY-RUN',
    rate,
    scanned,
    wouldChange: changed,
    skippedNoYen: skipped,
    examples,
  }, null, 2));

  if (!apply) console.log('\nDRY-RUN 完成。確認無誤後加 --apply 真正更新。');
  else console.log('\n已寫入資料庫。');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
