-- Restore the order status tables used by the existing admin order API.
-- Production review on 2026-11-12 found the optional state-machine migration
-- was absent. This adds missing tables/indexes only; it does not alter orders,
-- payments, inventory or points and does not backfill status history.

BEGIN;

CREATE TABLE IF NOT EXISTS order_status_history (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status  VARCHAR(20),
  to_status    VARCHAR(20) NOT NULL,
  note         TEXT,
  processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON order_status_history(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id                   SERIAL PRIMARY KEY,
  order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state                VARCHAR(20) NOT NULL DEFAULT 'pending',
  shipping_method_code VARCHAR(50),
  tracking_number      VARCHAR(120),
  handler_admin_id     INTEGER REFERENCES users(id),
  note                 TEXT,
  shipped_at           TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_of_order ON order_fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_of_state ON order_fulfillments(state);

CREATE TABLE IF NOT EXISTS order_fulfillment_items (
  fulfillment_id INTEGER NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  order_item_id  INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (fulfillment_id, order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_offi_item ON order_fulfillment_items(order_item_id);

COMMIT;
