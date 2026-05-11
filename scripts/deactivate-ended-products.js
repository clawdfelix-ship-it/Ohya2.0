require('dotenv').config();

const { Pool } = require('pg');

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0, pattern: '販売終了' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--pattern') args.pattern = String(argv[++i] || '').trim() || '販売終了';
  }
  return args;
}

function buildDeactivateSql({ pattern, limit }) {
  const like = `%${String(pattern || '').trim()}%`;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 1000000000;
  const sql = `
WITH targets AS (
  SELECT id
  FROM products
  WHERE status = 'active'
    AND COALESCE(name_zh_hk, name) ILIKE $1
  ORDER BY id ASC
  LIMIT $2
)
UPDATE products p
SET status = 'inactive',
    unpublish_at = COALESCE(unpublish_at, NOW()),
    updated_at = NOW()
FROM targets t
WHERE p.id = t.id
RETURNING p.id
  `.trim();
  return { sql, params: [like, safeLimit] };
}

async function main() {
  const { dryRun, limit, pattern } = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  try {
    const like = `%${String(pattern || '').trim()}%`;
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM products
       WHERE status = 'active'
         AND COALESCE(name_zh_hk, name) ILIKE $1`,
      [like]
    );
    const total = countResult.rows[0] ? Number(countResult.rows[0].total) : 0;

    if (dryRun) {
      console.log(JSON.stringify({ ok: true, mode: 'dry-run', pattern, total }, null, 2));
      return;
    }

    const { sql, params } = buildDeactivateSql({ pattern, limit });
    const result = await pool.query(sql, params);
    console.log(JSON.stringify({ ok: true, mode: 'deactivate', pattern, totalMatched: total, deactivated: result.rowCount }, null, 2));
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

