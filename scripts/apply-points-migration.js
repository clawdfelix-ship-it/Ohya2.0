// 一次性：套用積分遷移到 DATABASE_URL 指向嘅庫。
// 用 app 同款 getConnectionString，唔喺 shell 暴露連線字串。
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// 載入 .env
try {
  require('dotenv').config();
} catch (_) {}

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

const cs = getConnectionString();
if (!cs) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'migrations', '2026-09-26-points-system.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  const pool = new Pool({ connectionString: cs, ssl: /sslmode=require/i.test(cs) ? { rejectUnauthorized: false } : undefined });
  try {
    const host = await pool.query('SELECT current_database() AS db');
    console.log('Connected DB:', host.rows[0].db);

    // 執行前狀態
    const before = await pool.query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_name='points_transactions')::int AS has_txn_table,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name='points')::int AS has_points_col
    `);
    console.log('Before:', before.rows[0]);

    await pool.query(sql);
    console.log('Migration executed OK');

    // 執行後驗證
    const idx = await pool.query(`
      SELECT indexname FROM pg_indexes WHERE indexname='uq_points_txn_order_type'
    `);
    const settings = await pool.query(`
      SELECT key, value FROM app_settings WHERE key LIKE 'points_%' ORDER BY key
    `);
    const bal = await pool.query('SELECT count(*)::int AS users_with_points FROM users WHERE points <> 0');
    console.log('Unique index:', idx.rows.length ? 'present' : 'MISSING');
    console.log('Settings:');
    settings.rows.forEach((r) => console.log('  ', r.key, '=', r.value));
    console.log('Users with non-zero points:', bal.rows[0].users_with_points);
  } catch (e) {
    console.error('MIGRATION FAILED:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
