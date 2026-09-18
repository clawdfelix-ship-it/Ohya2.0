const test = require('node:test');
const assert = require('node:assert/strict');

const { nextFirstOfMonth, hkParts } = require('../utils/exchangeRateScheduler');

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
