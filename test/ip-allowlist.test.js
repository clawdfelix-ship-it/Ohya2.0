const test = require('node:test');
const assert = require('node:assert/strict');

test('parseAllowedIps: splits comma list and trims', () => {
  const { parseAllowedIps } = require('../utils/ipAllowlist');
  assert.deepEqual(parseAllowedIps(' 1.1.1.1,2.2.2.2 , '), new Set(['1.1.1.1', '2.2.2.2']));
});

test('extractClientIp: prefers x-forwarded-for first ip', () => {
  const { extractClientIp } = require('../utils/ipAllowlist');
  assert.equal(extractClientIp({ xForwardedFor: '1.1.1.1, 2.2.2.2', remoteAddress: '9.9.9.9' }), '1.1.1.1');
});

test('extractClientIp: normalizes ipv6-mapped ipv4', () => {
  const { extractClientIp } = require('../utils/ipAllowlist');
  assert.equal(extractClientIp({ xForwardedFor: '', remoteAddress: '::ffff:8.8.8.8' }), '8.8.8.8');
});

test('isIpAllowed: matches exact ip', () => {
  const { parseAllowedIps, isIpAllowed } = require('../utils/ipAllowlist');
  const allowed = parseAllowedIps('1.1.1.1,2.2.2.2');
  assert.equal(isIpAllowed(allowed, '2.2.2.2'), true);
  assert.equal(isIpAllowed(allowed, '3.3.3.3'), false);
});

