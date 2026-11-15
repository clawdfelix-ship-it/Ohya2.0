// P3-a：套用 storefront_events 遷移（事件表）。
//
// 用法：
//   node scripts/apply-storefront-events-migration.js --dry-run   # 只檢查，唔會改 DB
//   node scripts/apply-storefront-events-migration.js             # 真正套用
//   node scripts/apply-storefront-events-migration.js --prune     # 額外清 180 日前舊事件
//
// 注意：
//  - 呢個 script 唔會喺 CI / deploy 自動跑；要人手（Felix 批准後）先跑。
//  - migration 用 IF NOT EXISTS，可以安全重跑。
//  - 唔會改 orders / products / payments 任何既有資料。
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

try {
  require('dotenv').config();
} catch (_) {}

const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

const cs = getConnectionString();
if (!cs) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'migrations', '2026-11-15-storefront-events.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  const pool = new Pool({
    connectionString: cs,
    ssl: /sslmode=require/i.test(cs) ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const host = await pool.query('SELECT current_database() AS db');
    console.log('Connected DB:', host.rows[0].db);

    const before = await pool.query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_name = 'storefront_events')::int AS has_table,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = 'storefront_events' AND column_name = 'order_ref')::int AS has_order_ref
    `);
    console.log('Before:', before.rows[0]);

    if (DRY_RUN) {
      console.log('--dry-run：唔會執行任何寫入');
      console.log('Migration file:', sqlPath);
      console.log('Would execute:', sql.split('\n').length, 'lines');
      // 唔喺呢度 pool.end()：finally 會統一收（之前雙重 end 會報
      // "Called end on pool more than once" 並令 exit code 變 1）
      return;
    }

    await pool.query(sql);
    console.log('Migration executed OK');

    if (PRUNE) {
      const pruned = await pool.query(
        "DELETE FROM storefront_events WHERE ts < NOW() - INTERVAL '180 days'"
      );
      console.log('Pruned old events:', pruned.rowCount);
    }

    const after = await pool.query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_name = 'storefront_events')::int AS has_table,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = 'storefront_events' AND column_name = 'order_ref')::int AS has_order_ref,
        (SELECT count(*) FROM pg_indexes WHERE tablename = 'storefront_events')::int AS index_count
    `);
    console.log('After:', after.rows[0]);

    const rows = await pool.query('SELECT count(*)::int AS events FROM storefront_events');
    console.log('Event rows:', rows.rows[0].events);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
