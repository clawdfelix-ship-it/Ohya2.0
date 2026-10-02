#!/usr/bin/env node
/**
 * scripts/import-japan-wholesale.js
 *
 * Import Japan wholesale prices (Excel) into product_skus via trigram name match.
 *
 * Strategy D (三層分級):
 *   - sim >= 0.70 → status='auto', UPSERT cost_price + wholesale_price
 *   - sim 0.50-0.70 → status='unverified', UPSERT but admin UI marks "to review"
 *   - sim < 0.50 OR no candidate → export to tmp/unmatched-*.csv, NO write
 *
 * Wholesale price formula (tier-based markup on JPY cost):
 *   cost < ¥1000  → ×1.8
 *   ¥1000-3000    → ×1.5
 *   > ¥3000       → ×1.3
 *   wholesale_hkd = cost_jpy / 100 * fx_jpy_hkd * markup
 *
 * Idempotent: re-running with same Excel refreshes costs, audit columns updated.
 *
 * Usage:
 *   PG_URL=... node scripts/import-japan-wholesale.js [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function classify(sim) {
  if (sim === null || sim === undefined) return 'no_match';
  if (sim >= 0.70) return 'auto';
  if (sim >= 0.50) return 'unverified';
  return 'low_sim';
}

function markupMultiplier(priceJpy, tiers) {
  // tiers: [{ max_jpy, multiplier }, ...] sorted ascending by max_jpy (null = ∞)
  for (const t of tiers) {
    if (t.max_jpy === null || priceJpy < t.max_jpy) {
      return t.multiplier;
    }
  }
  return tiers[tiers.length - 1].multiplier; // fallback to last tier
}

async function main() {
  const pgUrl = process.env.PG_URL;
  if (!pgUrl) {
    console.error('ERROR: PG_URL env var required (use /tmp/prod_url_unpooled.txt)');
    process.exit(1);
  }

  const client = new Client({ connectionString: pgUrl });
  await client.connect();
  console.log(`[${new Date().toISOString()}] Connected to DB${DRY_RUN ? ' (DRY-RUN)' : ''}`);

  // 1. Load FX + markup from app_settings
  const { rows: fxRows } = await client.query(`
    SELECT value FROM app_settings WHERE key = 'fx.jpy_hkd'
  `);
  const { rows: markupRows } = await client.query(`
    SELECT value FROM app_settings WHERE key = 'markup.tiers_below'
  `);
  if (!fxRows.length || !markupRows.length) {
    throw new Error('app_settings missing fx.jpy_hkd or markup.tiers_below');
  }
  const fx = parseFloat(fxRows[0].value);
  const tiers = markupRows[0].value;
  console.log(`FX = ${fx} (JPY/HKD ×100)`);
  console.log(`Markup tiers:`, tiers);

  // 2. Load match preview from stage.tmp_match_preview
  const { rows: matches } = await client.query(`
    SELECT
      row_id,
      excel_jan,
      excel_sku,
      excel_name,
      price_jpy,
      product_id,
      db_sku,
      db_name,
      db_name_zh,
      sim_name,
      sim_zh,
      sim_max
    FROM stage.tmp_match_preview
    ORDER BY row_id
  `);
  console.log(`Loaded ${matches.length} match candidates from stage.tmp_match_preview`);

  // 3. Find unmatched (no candidate at all) — Excel rows NOT in match preview
  const matchedRowIds = new Set(matches.map(m => m.row_id));
  const { rows: unmatchedAll } = await client.query(`
    SELECT row_id, jan, sku, brand, price_jpy, name
    FROM stage.tmp_japan_wholesale
    ORDER BY row_id
  `);
  const unmatchedNoCandidate = unmatchedAll.filter(r => !matchedRowIds.has(r.row_id));

  // 4. Classify + compute wholesale_price
  let nAuto = 0, nUnverified = 0, nLowSim = 0;
  const upserts = [];        // (status, sim, jan, product_id, cost_jpy, cost_hkd, wholesale_hkd)
  const exportLowSim = [];   // low-sim with candidate (review)
  const exportNoMatch = [];  // no candidate at all
  const exportMatched = [];  // audit full list

  for (const m of matches) {
    const cls = classify(m.sim_max);
    const costJpy = parseFloat(m.price_jpy);
    const costHkd = Math.round((costJpy / 100) * fx * 100) / 100;
    const markup = markupMultiplier(costJpy, tiers);
    const wholesaleHkd = Math.round(costHkd * markup * 100) / 100;

    const row = {
      status: cls,
      sim: parseFloat(m.sim_max),
      jan: m.excel_jan,
      excel_sku: m.excel_sku,
      excel_name: m.excel_name,
      db_sku: m.db_sku,
      db_name: m.db_name,
      product_id: m.product_id,
      cost_jpy: costJpy,
      cost_hkd: costHkd,
      markup,
      wholesale_hkd: wholesaleHkd,
    };
    exportMatched.push(row);

    if (cls === 'auto') {
      upserts.push(row);
      nAuto++;
    } else if (cls === 'unverified') {
      upserts.push({ ...row, status: 'unverified' });
      nUnverified++;
    } else {
      // low_sim — export, no write
      exportLowSim.push(row);
      nLowSim++;
    }
  }

  for (const u of unmatchedNoCandidate) {
    exportNoMatch.push({
      jan: u.jan,
      excel_sku: u.sku,
      excel_name: u.name,
      price_jpy: parseFloat(u.price_jpy),
      cost_hkd: Math.round((parseFloat(u.price_jpy) / 100) * fx * 100) / 100,
    });
  }

  console.log(`---`);
  console.log(`Classified:`);
  console.log(`  AUTO (sim>=0.70, will UPSERT):     ${nAuto}`);
  console.log(`  UNVERIFIED (sim 0.50-0.70, write): ${nUnverified}`);
  console.log(`  LOW_SIM (sim<0.50, export only):   ${nLowSim}`);
  console.log(`  NO_CANDIDATE (export only):         ${exportNoMatch.length}`);

  // 5. Export audit CSVs
  const tmpDir = path.resolve(__dirname, '..', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const csvHeader = (cols) => cols.join(',') + '\n';
  const csvRow = (o, cols) => cols.map(c => {
    let v = o[c];
    if (v === null || v === undefined) v = '';
    v = String(v).replace(/[",\n\r]/g, ' ');
    return /[",\n]/.test(String(v)) ? `"${v}"` : v;
  }).join(',') + '\n';

  const allCols = ['status','sim','jan','excel_sku','db_sku','product_id','excel_name','db_name','cost_jpy','cost_hkd','markup','wholesale_hkd'];
  fs.writeFileSync(path.join(tmpDir, 'matched-all.csv'),
    csvHeader(allCols) + exportMatched.map(r => csvRow(r, allCols)).join(''));

  const lowCols = ['jan','excel_sku','excel_name','db_sku','product_id','db_name','sim','price_jpy','cost_hkd'];
  fs.writeFileSync(path.join(tmpDir, 'unmatched-low-similarity.csv'),
    csvHeader(lowCols) + exportLowSim.map(r => csvRow(r, lowCols)).join(''));

  const noCols = ['jan','excel_sku','excel_name','price_jpy','cost_hkd'];
  fs.writeFileSync(path.join(tmpDir, 'unmatched-no-candidate.csv'),
    csvHeader(noCols) + exportNoMatch.map(r => csvRow(r, noCols)).join(''));

  console.log(`---`);
  console.log(`Audit CSVs:`);
  console.log(`  tmp/matched-all.csv                 (${exportMatched.length} rows)`);
  console.log(`  tmp/unmatched-low-similarity.csv    (${exportLowSim.length} rows)`);
  console.log(`  tmp/unmatched-no-candidate.csv      (${exportNoMatch.length} rows)`);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Skipping UPSERT. Run without --dry-run to apply.`);
    await client.end();
    return;
  }

  // 6. UPSERT (single transaction, batched)
  console.log(`\nUpserting ${upserts.length} rows...`);
  await client.query('BEGIN');
  try {
    let nUpdated = 0;
    for (const r of upserts) {
      const result = await client.query(`
        UPDATE product_skus
        SET
          cost_price = $1,
          cost_price_jpy = $2,
          wholesale_price_hkd = $3,
          match_status = $4,
          match_sim = $5,
          match_source_jan = $6,
          match_matched_at = NOW(),
          updated_at = NOW()
        WHERE id = (SELECT id FROM product_skus WHERE product_id = $7 ORDER BY id LIMIT 1)
      `, [
        r.cost_hkd,
        r.cost_jpy,
        r.wholesale_hkd,
        r.status,
        r.sim,
        r.jan,
        r.product_id,
      ]);
      nUpdated += result.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Updated ${nUpdated} product_skus rows`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  // 7. Summary
  console.log(`\n=== DONE ===`);
  console.log(`Wholesale prices applied: ${nAuto} auto + ${nUnverified} unverified = ${nAuto + nUnverified}`);
  console.log(`Review queue: ${exportLowSim.length + exportNoMatch.length} unmatched (see CSVs)`);

  await client.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
