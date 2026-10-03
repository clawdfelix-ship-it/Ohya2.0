const test = require('node:test');
const assert = require('node:assert/strict');

const { nextFirstOfMonth, hkParts, alreadyRanThisMonth } = require('../utils/exchangeRateScheduler');

test('hkParts returns Hong Kong wall-clock parts', () => {
  // 2026-09-18 02:00 UTC = 10:00 HKT same day
  const p = hkParts(new Date('2026-09-18T02:00:00Z'));
  assert.equal(p.year, 2026);
  assert.equal(p.month, 9);
  assert.equal(p.day, 18);
  assert.equal(p.hour, 10);
});

test('before the 1st 09:00 HKT → schedules this month 1st 09:00 HKT', () => {
  // 2026-09-01 00:30 HKT = 2026-08-31 16:30 UTC
  const from = new Date('2026-08-31T16:30:00Z');
  const at = nextFirstOfMonth(9, from);
  const hk = hkParts(at);
  assert.equal(hk.year, 2026);
  assert.equal(hk.month, 9);
  assert.equal(hk.day, 1);
  assert.equal(hk.hour, 9);
  assert.equal(hk.minute, 0);
  assert.ok(at.getTime() > from.getTime());
});

test('after this month 1st 09:00 HKT → rolls to next month', () => {
  // 2026-09-18 10:00 HKT
  const from = new Date('2026-09-18T02:00:00Z');
  const at = nextFirstOfMonth(9, from);
  const hk = hkParts(at);
  assert.equal(hk.year, 2026);
  assert.equal(hk.month, 10);
  assert.equal(hk.day, 1);
  assert.equal(hk.hour, 9);
});

test('December rolls over to January next year', () => {
  // 2026-12-20 HKT
  const from = new Date('2026-12-20T02:00:00Z');
  const at = nextFirstOfMonth(9, from);
  const hk = hkParts(at);
  assert.equal(hk.year, 2027);
  assert.equal(hk.month, 1);
  assert.equal(hk.day, 1);
});

test('alreadyRanThisMonth reads jpy_rate_last_auto_at and returns true for same-month runs', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ value: 'x', updated_at: new Date().toISOString(), updated_by: null }] };
    },
  };
  const ok = await alreadyRanThisMonth(pool);
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], 'jpy_rate_last_auto_at');
});

test('alreadyRanThisMonth returns false for previous-month runs', async () => {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 0, 0, 0));
  const pool = {
    query: async () => ({ rows: [{ value: 'x', updated_at: prev.toISOString(), updated_by: null }] }),
  };
  const ok = await alreadyRanThisMonth(pool);
  assert.equal(ok, false);
});
