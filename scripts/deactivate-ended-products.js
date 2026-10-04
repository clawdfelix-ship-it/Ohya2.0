require('dotenv').config();

const { Pool } = require('pg');

/**
 * 將「出荷＝販売終了」嘅同步產品下架。
 *
 * 判定以爬詳情時解析嘅出荷狀態 raw_payload.isEnded 為準，唔靠名稱——
 * 大多數終了商品名稱唔含「販売終了」（名稱匹配只捉到 3 件，實際有 ~3901 件）。
 * 規則來源：Felix 2026-10-05。
 */

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
  }
  return args;
}

function buildDeactivateSql({ limit }) {
  const safeLimit = Number(limit) > 0 ? Number(limit) : 1000000000;
  const sql = `
WITH targets AS (
  SELECT id
  FROM products
  WHERE status = 'active'
    AND source = 'mzakka'
    AND raw_payload->>'isEnded' = 'true'
  ORDER BY id ASC
  LIMIT $1
)
UPDATE products p
SET status = 'inactive',
    unpublish_at = COALESCE(unpublish_at, NOW()),
    updated_at = NOW()
FROM targets t
WHERE p.id = t.id
RETURNING p.id
  `.trim();
  return { sql, params: [safeLimit] };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM products
       WHERE status = 'active'
         AND source = 'mzakka'
         AND raw_payload->>'isEnded' = 'true'`
    );
    const total = countResult.rows[0] ? Number(countResult.rows[0].total) : 0;

    if (dryRun) {
      console.log(JSON.stringify({ ok: true, mode: 'dry-run', basis: 'raw_payload.isEnded', total }, null, 2));
      return;
    }

    const { sql, params } = buildDeactivateSql({ limit });
    const result = await pool.query(sql, params);
    console.log(JSON.stringify({
      ok: true,
      mode: 'deactivate',
      basis: 'raw_payload.isEnded',
      totalMatched: total,
      deactivated: result.rowCount,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, buildDeactivateSql };
