-- Proposed local migration only. Requires Felix's explicit production approval.
-- No credential is inserted here and no existing table/trigger is altered.
BEGIN;

CREATE TABLE IF NOT EXISTS agent_api_credentials (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  token_prefix VARCHAR(16) NOT NULL UNIQUE,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes JSONB NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_api_credentials_active_idx
  ON agent_api_credentials (token_prefix, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_audit_idempotency (
  credential_id UUID NOT NULL REFERENCES agent_api_credentials(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (credential_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS agent_audit_events (
  id BIGSERIAL PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES agent_api_credentials(id) ON DELETE RESTRICT,
  actor VARCHAR(100) NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku_id INTEGER REFERENCES product_skus(id) ON DELETE RESTRICT,
  action VARCHAR(50) NOT NULL,
  old_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128),
  result VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_audit_events_product_idx
  ON agent_audit_events (product_id, sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_audit_events_credential_idx
  ON agent_audit_events (credential_id, created_at DESC);

COMMIT;
