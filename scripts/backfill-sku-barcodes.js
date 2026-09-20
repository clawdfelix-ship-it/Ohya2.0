#!/usr/bin/env node
/**
 * 回填 product_skus.barcode：由商品描述 / raw_payload 抽出廠 JAN code
 * ============================================================
 * mzakka 嘅出廠 JAN 以「JANコード：4571355635590」埋喺描述文字，
 * 規格表冇。本 script：
 *   1. 掃 products（mzakka）嘅 description / raw_payload / sections
 *   2. 用 utils/janCode 抽有效 JAN（45/49、13 位）
 *   3. 寫入對應 product_skus.barcode
 *
 *   node scripts/backfill-sku-barcodes.js            # dry-run（只統計）
 *   node scripts/backfill-sku-barcodes.js --apply    # 真正更新
 */
const { getPool } = require('../utils/getPool');
const { extractPrimaryJan } = require('../utils/janCode');
const { extractManufacturerModel } = require('../utils/manufacturerModel');

function gatherSourceText(product) {
  const parts = [];
  if (product.description) parts.push(product.description);
  const rp = product.raw_payload;
  if (rp && typeof rp === 'object') {
    if (rp.description) parts.push(rp.description);
    if (Array.isArray(rp.sections)) {
      rp.sections.forEach((s) => {
        if (s && s.contentText) parts.push(s.contentText);
        if (s && s.contentHtml) parts.push(s.contentHtml);
      });
    }
    if (Array.isArray(rp.productInfo)) {
      rp.productInfo.forEach((r) => {
        if (r && /jan/i.test(String(r.label))) parts.push(`${r.label} ${r.value}`);
      });
    }
  }
  return parts.join('\n');
}

async function scan(pool) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.source_key, p.description, p.raw_payload,
            (SELECT json_agg(json_build_object('sku_id', s.id, 'barcode', s.barcode,
                                              'manufacturer_code', s.manufacturer_code))
               FROM product_skus s WHERE s.product_id = p.id) AS skus
       FROM products p
      WHERE p.source = 'mzakka'`
  );

  const updates = [];
  const stats = {
    total: rows.length, withJan: 0, withModel: 0,
    barcodeWillSet: 0, barcodeAlready: 0,
    modelWillSet: 0, modelAlready: 0,
    multiSku: 0, conflicts: [],
  };

  for (const p of rows) {
    const skus = Array.isArray(p.skus) ? p.skus : [];
    if (skus.length > 1) stats.multiSku += 1;

    const jan = extractPrimaryJan(gatherSourceText(p));
    if (jan) stats.withJan += 1;

    // 型號：由商品名（mzakka 標題核心）抽；DB 名冇後綴，傳 ownCode 排除自編號
    const ownCode = p.raw_payload && p.raw_payload.id ? String(p.raw_payload.id) : String(p.source_key || '');
    const model =
      extractManufacturerModel(p.name, { ownCode }) ||
      (p.raw_payload ? extractManufacturerModel(p.raw_payload.name, { ownCode }) : null);
    if (model) stats.withModel += 1;

    for (const s of skus) {
      if (jan) {
        if (s.barcode) {
          stats.barcodeAlready += 1;
          if (s.barcode !== jan) stats.conflicts.push({ product: p.id, sku: s.sku_id, existing: s.barcode, found: jan });
        } else {
          stats.barcodeWillSet += 1;
        }
      }
      if (model) {
        if (s.manufacturer_code) {
          stats.modelAlready += 1;
        } else {
          stats.modelWillSet += 1;
        }
      }
      if (jan || model) {
        updates.push({ skuId: s.sku_id, productId: p.id, jan: s.barcode ? null : jan, model: s.manufacturer_code ? null : model });
      }
    }
  }
  return { stats, updates };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = getPool();
  if (!pool) {
    console.error('No DATABASE_URL.');
    process.exit(1);
  }

  const { stats, updates } = await scan(pool);

  if (apply) {
    for (const u of updates) {
      const sets = [];
      const vals = [];
      if (u.jan) { sets.push(`barcode = $${sets.length + 1}`); vals.push(u.jan); }
      if (u.model) { sets.push(`manufacturer_code = $${sets.length + 1}`); vals.push(u.model); }
      if (!sets.length) continue;
      vals.push(u.skuId);
      await pool.query(`UPDATE product_skus SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY-RUN', stats, sampleUpdates: updates.slice(0, 5) }, null, 2));
  console.log(apply ? `\n已更新 ${updates.length} 個 SKU（barcode / manufacturer_code）。` : `\nDRY-RUN：可更新 ${updates.length} 個 SKU。確認無誤加 --apply。`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
