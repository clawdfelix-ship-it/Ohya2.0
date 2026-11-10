'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  generateCredentialSecret,
  credentialDigest,
  parseBearerCredential,
  safeHashEqual,
  createAgentCredentialAuth,
} = require('../lib/agentCredentials');

const raw = 'local-test-only-' + 'a'.repeat(64);
const record = {
  id: '123e4567-e89b-42d3-a456-426614174000', name: 'local-test-agent',
  token_prefix: raw.slice(0, 16), token_hash: credentialDigest(raw),
  scopes: ['products:read', 'products:content:write'], expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null,
};

function request(headers = {}) {
  return { get(name) { return headers[name.toLowerCase()] || ''; }, session: null };
}

function response() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function poolFor(row, calls) {
  return { async query(sql, values) {
    calls.push({ sql, values });
    if (/SELECT/.test(sql)) return { rows: row ? [row] : [] };
    return { rows: [] };
  } };
}

test('local test credential generation is >=32 random bytes; only hashes are stored', () => {
  const credential = generateCredentialSecret();
  assert.equal(credential.secret.length >= 64, true);
  assert.equal(Buffer.from(credential.secret, 'base64url').length >= 32, true);
  assert.equal(credentialDigest(credential.secret), crypto.createHash('sha256').update(credential.secret, 'utf8').digest('hex'));
  assert.equal(credential.hash.includes(credential.secret), false);
  assert.notEqual(generateCredentialSecret().secret, credential.secret);
  assert.equal(parseBearerCredential(`Bearer ${raw}`).prefix, raw.slice(0, 16));
  assert.equal(parseBearerCredential(`Bearer ${raw}`).secret, raw);
  assert.equal(parseBearerCredential('Bearer short'), null);
  assert.equal(parseBearerCredential(`Bearer ${raw}, ${raw}`), null);
});

test('hash comparison is constant-time and does not leak unequal lengths', () => {
  assert.equal(safeHashEqual(credentialDigest(raw), credentialDigest(raw)), true);
  assert.equal(safeHashEqual(credentialDigest(raw), credentialDigest(raw + 'x')), false);
  assert.equal(safeHashEqual(credentialDigest(raw), 'bad'), false);
});

test('auth accepts only a live scoped DB credential; no Admin cookie/session fallback', async () => {
  const calls = [];
  const auth = createAgentCredentialAuth({ pool: poolFor(record, calls), now: () => new Date('2026-11-10T00:00:00Z') });
  const req = request({ authorization: `Bearer ${raw}` });
  req.session = { userId: 1, isAdmin: true, adminPermissions: ['*'] };
  const res = response();
  await auth('products:read')(req, res, () => { req.authenticated = true; });
  assert.equal(req.authenticated, true);
  assert.equal(req.agentCredential.id, record.id);
  assert.equal(req.user, undefined);
  assert.equal(req.session.isAdmin, true, 'never mutates Admin session');
  assert.match(calls[0].sql, /token_prefix/);
  assert.match(calls[0].sql, /revoked_at IS NULL/);
  assert.match(calls[0].sql, /expires_at > NOW\(\)/);
  assert.equal(calls[1].values[0], record.id);
  assert.equal(JSON.stringify(calls).includes(raw), false);
  const unauthenticatedSession = { userId: 1, isAdmin: true, adminPermissions: ['*'] };
  const rejectedSession = response();
  await auth('products:read')(request(), rejectedSession, () => { throw new Error('cookie/session must not authenticate'); });
  assert.equal(rejectedSession.statusCode, 401);
  assert.equal(unauthenticatedSession.isAdmin, true);

  const missingScope = response();
  await auth('products:pricing:write')(req, missingScope, () => { throw new Error('must not run'); });
  assert.equal(missingScope.statusCode, 403);
  assert.equal(missingScope.payload.code, 'SCOPE_REQUIRED');
});

test('auth rejects wrong, expired, revoked, missing credentials and database failures safely', async () => {
  const now = () => new Date('2026-11-10T00:00:00Z');
  const cases = [
    [null, raw, 401],
    [{ ...record, token_hash: credentialDigest(raw + 'wrong') }, raw, 401],
    [{ ...record, expires_at: '2026-11-09T00:00:00Z' }, raw, 401],
    [{ ...record, revoked_at: '2026-11-09T00:00:00Z' }, raw, 401],
    [record, '', 401],
    [record, 'Bearer short', 401],
  ];
  for (const [row, authorization, expected] of cases) {
    const res = response();
    await createAgentCredentialAuth({ pool: poolFor(row, []), now })('products:read')(request({ authorization }), res, () => { throw new Error('must not run'); });
    assert.equal(res.statusCode, expected);
    assert.equal(JSON.stringify(res.payload).includes('stack'), false);
  }
  const res = response();
  await createAgentCredentialAuth({ pool: { async query() { throw new Error('private SQL detail'); } }, now })('products:read')(request({ authorization: `Bearer ${raw}` }), res, () => { throw new Error('must not run'); });
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res.payload).includes('private SQL'), false);
});
