require('dotenv').config();

const { getPool } = require('../utils/getPool');
const {
  translateCategoryName,
  shouldBackfillCategoryName,
  normalizeCategoryName,
} = require('../utils/categoryTranslations');

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--limit') args.limit = Math.max(0, Number(argv[++i] || 0));
  }
  return args;
}

async function backfillCategoryTranslations({ dryRun = false, limit = 0 } = {}) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not set');

  const limitSql = limit ? `LIMIT ${Number(limit)}` : '';
  const result = await pool.query(
    `SELECT id, name, name_zh_hk
     FROM categories
     WHERE status = 'active'
     ORDER BY id ASC
     ${limitSql}`
  );

  let updated = 0;
  let skipped = 0;
  const misses = [];

  for (const row of result.rows) {
    const name = normalizeCategoryName(row.name);
    const nameZhHk = normalizeCategoryName(row.name_zh_hk);
    const { translatedName, didTranslate } = translateCategoryName(name);

    if (!didTranslate) {
      skipped += 1;
      if (name && misses.length < 30) misses.push(name);
      continue;
    }

    if (!shouldBackfillCategoryName(name, nameZhHk)) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await pool.query(
        `UPDATE categories
         SET name_zh_hk = $1
         WHERE id = $2`,
        [translatedName, row.id]
      );
    }
  }

  return {
    scanned: result.rows.length,
    updated,
    skipped,
    dryRun,
    misses,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  try {
    const summary = await backfillCategoryTranslations(args);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  backfillCategoryTranslations,
};
