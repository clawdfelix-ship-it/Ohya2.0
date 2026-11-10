'use strict';

const crypto = require('node:crypto');
const { ALL_PRODUCT_SCOPES } = require('./agentProductValidation');

function generateCredentialSecret() {
  const secret = crypto.randomBytes(48).toString('base64url');
  return { secret, prefix: secret.slice(0, 16), hash: credentialDigest(secret) };
}

function credentialDigest(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest('hex');
}

function parseBearerCredential(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(header.trim());
  if (!match) return null;
  const secret = match[1];
  return { secret, prefix: secret.slice(0, 16) };
}

function safeHashEqual(provided, expected) {
  if (!/^[a-f0-9]{64}$/.test(String(provided)) || !/^[a-f0-9]{64}$/.test(String(expected))) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

function hasScope(scopes, required) {
  if (!ALL_PRODUCT_SCOPES.includes(required)) return false;
  return Array.isArray(scopes) && scopes.every((scope) => typeof scope === 'string') && scopes.includes(required);
}

function createAgentCredentialAuth({ pool, now = () => new Date() }) {
  return function requireAgentScope(scope) {
    return async function agentCredentialAuth(req, res, next) {
      const parsed = parseBearerCredential(req.get('authorization'));
      if (!parsed) return res.status(401).json({ error: 'Valid agent credential required', code: 'AGENT_AUTH_REQUIRED' });
      try {
        const result = await pool.query(
          `SELECT id, name, token_hash, scopes, expires_at, revoked_at
             FROM agent_api_credentials
            WHERE token_prefix = $1
              AND revoked_at IS NULL
              AND expires_at > NOW()
            LIMIT 1`,
          [parsed.prefix]
        );
        const record = result.rows[0];
        if (!record || record.revoked_at || new Date(record.expires_at) <= now()
            || !safeHashEqual(credentialDigest(parsed.secret), record.token_hash)) {
          return res.status(401).json({ error: 'Valid agent credential required', code: 'AGENT_AUTH_REQUIRED' });
        }
        if (!hasScope(record.scopes, scope)) {
          return res.status(403).json({ error: 'Agent credential lacks required scope', code: 'SCOPE_REQUIRED', scope });
        }
        // Deliberately independent: no req.user, Admin cookie, session or sync-secret fallback.
        req.agentCredential = { id: record.id, name: record.name, scopes: record.scopes };
        await pool.query(
          'UPDATE agent_api_credentials SET last_used_at = NOW() WHERE id = $1',
          [record.id]
        );
        return next();
      } catch (error) {
        console.error('Agent credential authentication failed:', error && error.code ? error.code : 'unknown');
        return res.status(503).json({ error: 'Agent authentication unavailable', code: 'AGENT_AUTH_UNAVAILABLE' });
      }
    };
  };
}

module.exports = { generateCredentialSecret, credentialDigest, parseBearerCredential, safeHashEqual, createAgentCredentialAuth, hasScope };
