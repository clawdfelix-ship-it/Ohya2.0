/**
 * 回填「重建新樹」分類港式中文名（mzakka-cat-real-*）
 * ============================================================
 * 只更新 slug LIKE 'mzakka-cat-real-%' 嗰 257 個分類（商品實際用嘅樹），
 * 用 bulk VALUES UPDATE，唔會掃 25,807 個舊垃圾 facet。
 *
 *   node scripts/backfill-newtree-category-names.js            # dry-run
 *   node scripts/backfill-newtree-category-names.js --apply
 */
const { getPool } = require('../utils/getPool');
const {
  translateCategoryName,
  normalizeCategoryName,
} = require('../utils/categoryTranslations');

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = getPool();
  if (!pool) {
    console.error('No DATABASE_URL.');
    process.exit(1);
  }

  const { rows } = await pool.query(`
    SELECT id, name, name_zh_hk
      FROM categories
     WHERE slug LIKE 'mzakka-cat-real-%'
     ORDER BY id`);

  const pairs = [];
  let same = 0;
  let noTranslation = 0;
  for (const r of rows) {
    const sourceName = normalizeCategoryName(r.name);
    const zhName = normalizeCategoryName(r.name_zh_hk);
    const { translatedName, didTranslate } = translateCategoryName(sourceName);
    if (!didTranslate) {
      noTranslation += 1;
      continue;
    }
    if (zhName === translatedName) {
      same += 1;
      continue;
    }
    pairs.push([r.id, translatedName]);
  }

  if (apply) {
    const client = await pool.connect();
    for (let i = 0; i < pairs.length; i += 2000) {
      const chunk = pairs.slice(i, i + 2000);
      const vals = [];
      const ph = [];
      let n = 1;
      for (const [id, name] of chunk) {
        ph.push(`($${n}::int,$${n + 1}::varchar)`);
        vals.push(id, name);
        n += 2;
      }
      await client.query(
        `UPDATE categories c SET name_zh_hk = v.name, updated_at = now()
           FROM (VALUES ${ph.join(',')}) AS v(id, name)
          WHERE c.id = v.id`,
        vals
      );
    }
    client.release();
  }

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY-RUN',
    newTreeTotal: rows.length,
    alreadyCorrect: same,
    noTranslation,
    willUpdate: pairs.length,
    samples: pairs.slice(0, 8),
  }, null, 2));
  console.log(apply
    ? `\n已更新 ${pairs.length} 個新樹分類中文名。`
    : `\nDRY-RUN：將更新 ${pairs.length} 個。確認加 --apply。`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
