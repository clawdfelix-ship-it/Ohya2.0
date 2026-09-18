const test = require('node:test');
const assert = require('node:assert/strict');

// 單獨載入 currency，避免 env 被其他測試污染
delete process.env.JPY_HKD_RATE;
const {
  DEFAULT_JPY_HKD_RATE,
  jpyToHkdRate,
  yenToHkd,
  yenToHkdCents,
} = require('../utils/currency');

test('default rate is 0.052 (100 JPY ~ HK$5.2)', () => {
  assert.equal(DEFAULT_JPY_HKD_RATE, 0.052);
  assert.equal(jpyToHkdRate(), 0.052);
});

test('env JPY_HKD_RATE overrides default when positive', () => {
  process.env.JPY_HKD_RATE = '0.058';
  assert.equal(jpyToHkdRate(), 0.058);
  delete process.env.JPY_HKD_RATE;
  assert.equal(jpyToHkdRate(), 0.052);
});

test('invalid env rate falls back to default', () => {
  for (const bad of ['', 'abc', '-1', '0']) {
    process.env.JPY_HKD_RATE = bad;
    assert.equal(jpyToHkdRate(), 0.052, `should reject ${JSON.stringify(bad)}`);
  }
  delete process.env.JPY_HKD_RATE;
});

test('yenToHkd converts and rounds to 2 decimals', () => {
  // 2980 * 0.052 = 154.96
  assert.equal(yenToHkd(2980), 154.96);
  // 100 JPY = HK$5.2
  assert.equal(yenToHkd(100), 5.2);
  assert.equal(yenToHkd(0), 0);
  assert.equal(yenToHkd(-5), 0);
  assert.equal(yenToHkd(NaN), 0);
});

test('yenToHkdCents returns integer cents', () => {
  // 2980 * 0.052 * 100 = 15496
  assert.equal(yenToHkdCents(2980), 15496);
  // 29900 * 0.052 * 100 = 155480 cents = HK$1554.8
  assert.equal(yenToHkdCents(29900), 155480);
  assert.equal(yenToHkdCents(0), 0);
});

test('explicit rate argument is honoured', () => {
  assert.equal(yenToHkd(1000, 0.06), 60);
  assert.equal(yenToHkdCents(1000, 0.06), 6000);
});
