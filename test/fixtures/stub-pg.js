'use strict';
// Test helper：stub 掉 pg Pool，等 migration script 可以喺冇真實 DB 之下行
// 所有查詢／寫入都會記錄落 process.env.STUB_PG_LOG（JSONL），方便測試斷言。
const fs = require('fs');
const path = require('path');

const logPath = process.env.STUB_PG_LOG;
const failOn = process.env.STUB_PG_FAIL_ON || '';

function log(entry) {
  if (!logPath) return;
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

class FakePool {
  constructor(opts) {
    this.ended = 0;
    this.queries = [];
    log({ type: 'pool_created', ssl: !!opts.ssl });
  }

  async query(sql, values = []) {
    this.queries.push({ sql, values });
    log({ type: 'query', sql: String(sql), values });
    if (failOn && String(sql).includes(failOn)) {
      throw new Error('stub failure for: ' + failOn);
    }
    if (/current_database/i.test(sql)) return { rows: [{ db: 'stub_db' }] };
    if (/information_schema\.tables/i.test(sql)) {
      return { rows: [{ has_table: 1, has_order_ref: 1, index_count: 3 }] };
    }
    if (/pg_indexes/i.test(sql)) {
      return { rows: [{ has_table: 1, has_order_ref: 1, index_count: 3 }] };
    }
    if (/count\(\*\)/i.test(sql)) return { rows: [{ events: 0 }] };
    if (/DELETE FROM storefront_events/i.test(sql)) return { rowCount: 0 };
    return { rows: [], rowCount: 0 };
  }

  async end() {
    this.ended += 1;
    log({ type: 'pool_end', count: this.ended });
    if (this.ended > 1) {
      throw new Error('Called end on pool more than once');
    }
  }
}

const pgPath = require.resolve('pg');
require.cache[pgPath] = {
  id: pgPath,
  filename: pgPath,
  loaded: true,
  exports: { Pool: FakePool, default: { Pool: FakePool } },
};
