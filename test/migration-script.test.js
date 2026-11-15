'use strict';
// Migration script 嘅驗證層測試（Step C）
//
// 修咗兩個既存 bug：
//  ① post-check 查 information_schema.indexes → Postgres 冇呢個 view，
//     應該用 pg_indexes（否則 DDL 已落地但 script 報 "Migration failed"）
//  ② dry-run 分支 pool.end() 之後 finally 又 pool.end()
//     → "Called end on pool more than once" + exit 1
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'apply-storefront-events-migration.js');
const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-pg.js');

function runScript(args = []) {
  const logPath = path.join(os.tmpdir(), `stub-pg-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
  const res = spawnSync(
    process.execPath,
    ['--require', STUB, SCRIPT, ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://stub/stub',
        STUB_PG_LOG: logPath,
      },
    }
  );
  const entries = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  fs.rmSync(logPath, { force: true });
  return { res, entries };
}

test('migration script：正常模式會用 pg_indexes 做 post-check（唔再查 information_schema.indexes）', () => {
  const { res, entries } = runScript([]);
  assert.equal(res.status, 0, `script 應該 exit 0，stderr: ${res.stderr}`);

  const queries = entries.filter((e) => e.type === 'query').map((e) => e.sql);
  const afterCheck = queries.find((q) => /pg_indexes/i.test(q));
  assert.ok(afterCheck, 'post-check 應該查 pg_indexes');
  assert.ok(
    !/information_schema\.indexes/i.test(afterCheck),
    'post-check 唔可以再查 information_schema.indexes（Postgres 冇呢個 view）'
  );
  assert.ok(!res.stdout.includes('Migration failed'), 'stdout 唔應該出現 Migration failed');
});

test('migration script：migration SQL 真係執行咗（DDL 落地）', () => {
  const { res, entries } = runScript([]);
  assert.equal(res.status, 0);
  const queries = entries.filter((e) => e.type === 'query').map((e) => e.sql);
  assert.ok(
    queries.some((q) => /CREATE TABLE IF NOT EXISTS storefront_events/i.test(q)),
    '應該執行 storefront_events DDL'
  );
  assert.ok(queries.some((q) => /order_ref/i.test(q)), '應該包含 order_ref 欄位 DDL');
});

test('migration script：dry-run 唔會執行任何寫入、唔會 double pool.end()、exit 0', () => {
  const { res, entries } = runScript(['--dry-run']);
  assert.equal(res.status, 0, `dry-run 應該 exit 0，stderr: ${res.stderr}`);
  assert.ok(!res.stderr.includes('Called end on pool more than once'), '唔應該 double pool.end()');

  const queries = entries.filter((e) => e.type === 'query').map((e) => e.sql);
  assert.ok(
    !queries.some((q) => /CREATE TABLE/i.test(q)),
    'dry-run 唔應該執行 DDL'
  );
  assert.ok(!queries.some((q) => /DELETE FROM storefront_events/i.test(q)), 'dry-run 唔應該 prune');

  const ends = entries.filter((e) => e.type === 'pool_end');
  assert.equal(ends.length, 1, `pool.end() 應該只行一次，現時 ${ends.length} 次`);
  assert.ok(res.stdout.includes('--dry-run'), 'stdout 應該標示 dry-run');
});

test('migration script：pool 只會 end 一次（正常模式）', () => {
  const { entries } = runScript([]);
  const ends = entries.filter((e) => e.type === 'pool_end');
  assert.equal(ends.length, 1);
});
