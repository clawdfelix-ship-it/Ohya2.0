'use strict';

const { createAgentCredentialAuth } = require('../lib/agentCredentials');
const { agentWriteLimiter } = require('../utils/security/rateLimiters');
const {
  validateProductPatch, validateSkuPatch, parseExpectedVersion,
  validateIdempotencyKey, requestDigest, AgentValidationError,
} = require('../lib/agentProductValidation');
const { computeNewStock } = require('../lib/inventory');

const VERSION = `to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version`;
const PRODUCT_COLUMNS = `id, name, name_zh_hk, slug, description, description_zh_hk,
  short_description, short_description_zh_hk, brand_id, category_id,
  cost_price, price, original_price, member_price, status, is_featured,
  image_url, gallery_images, video_url, product_type, is_digital,
  has_batch_expiry, enable_reviews, source, source_key, source_url, sync_status,
  created_at, updated_at, deleted_at, ${VERSION}`;
const SKU_COLUMNS = `id, product_id, sku, barcode, manufacturer_code, attributes,
  price, cost_price, cost_price_jpy, wholesale_price_hkd, original_price,
  stock, weight, weight_unit, is_active, match_status, match_source_jan,
  created_at, updated_at`;

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AgentValidationError(422, 'INVALID_ID', 'Product and SKU IDs must be positive integers');
  }
  return id;
}

function errorResponse(res, error) {
  if (error instanceof AgentValidationError) {
    const body = { error: error.message, code: error.code };
    for (const key of ['scope', 'fields']) if (error[key]) body[key] = error[key];
    return res.status(error.status).json(body);
  }
  console.error('Agent product operation failed:', error && error.code ? error.code : 'unknown');
  return res.status(500).json({ error: 'Agent product operation failed', code: 'AGENT_OPERATION_FAILED' });
}

function changedDiff(before, patch) {
  const oldData = {};
  const newData = {};
  for (const [key, value] of Object.entries(patch)) {
    const previous = before[key];
    if (JSON.stringify(previous) !== JSON.stringify(value)) {
      oldData[key] = previous === undefined ? null : previous;
      newData[key] = value;
    }
  }
  return { oldData, newData };
}

function assignments(patch, offset = 1) {
  const keys = Object.keys(patch);
  return {
    sql: keys.map((key, index) => `${key} = $${offset + index}`).join(', '),
    values: keys.map((key) => ['attributes', 'gallery_images'].includes(key) ? JSON.stringify(patch[key]) : patch[key]),
  };
}

module.exports = function registerAgentProducts(app, pool, options = {}) {
  const requireScope = createAgentCredentialAuth({ pool });
  const writeGuard = agentWriteLimiter();
  const allowedImageHosts = options.allowedImageHosts || String(process.env.AGENT_ALLOWED_IMAGE_HOSTS || 'i.mzakka.com')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);

  app.get('/api/agent/skus/lookup', requireScope('products:read'), async (req, res) => {
    try {
      const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
      if (!/^\d{8,14}$/.test(barcode)) {
        throw new AgentValidationError(422, 'INVALID_BARCODE', 'barcode must contain 8 to 14 digits');
      }
      const result = await pool.query(
        `SELECT s.id, s.product_id, s.barcode, s.stock,
          to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version
           FROM product_skus s
           JOIN products p ON p.id = s.product_id
          WHERE s.barcode = $1 AND p.deleted_at IS NULL
          ORDER BY s.id LIMIT 2`, [barcode]
      );
      if (result.rows.length > 1) {
        return res.status(409).json({ error: 'Barcode matches multiple active products; reconcile it before updating stock', code: 'BARCODE_AMBIGUOUS' });
      }
      const sku = result.rows[0];
      if (!sku) return res.status(404).json({ error: 'Barcode not found', code: 'BARCODE_NOT_FOUND' });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ product_sku_id: sku.id, product_id: sku.product_id, barcode: sku.barcode, stock_qty: sku.stock, version: sku.version });
    } catch (error) { return errorResponse(res, error); }
  });

  app.get('/api/agent/products/:id', requireScope('products:read'), async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const result = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL`, [id]);
      const product = result.rows[0];
      if (!product) return res.status(404).json({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' });
      const skus = await pool.query(`SELECT ${SKU_COLUMNS} FROM product_skus WHERE product_id = $1 ORDER BY id`, [id]);
      res.setHeader('ETag', `"${product.version}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ product, skus: skus.rows, version: product.version });
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch('/api/agent/products/:id', requireScope('products:read'), writeGuard, async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const patch = validateProductPatch(req.body, req.agentCredential.scopes, { allowedImageHosts });
      const expectedVersion = parseExpectedVersion(req.get('if-match'));
      const key = validateIdempotencyKey(req.get('idempotency-key'));
      const hash = requestDigest({ productId: id, skuId: null, patch });
      const outcome = await mutateProduct(pool, {
        credential: req.agentCredential, id, patch, expectedVersion, key, hash, skuId: null,
      });
      if (outcome.replay) res.setHeader('Idempotent-Replay', 'true');
      return res.status(outcome.status).json(outcome.body);
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch('/api/agent/products/:id/skus/:skuId', requireScope('products:read'), writeGuard, async (req, res) => {
    try {
      const id = positiveId(req.params.id);
      const skuId = positiveId(req.params.skuId);
      const patch = validateSkuPatch(req.body, req.agentCredential.scopes);
      const expectedVersion = parseExpectedVersion(req.get('if-match'));
      const key = validateIdempotencyKey(req.get('idempotency-key'));
      const hash = requestDigest({ productId: id, skuId, patch });
      const outcome = await mutateProduct(pool, {
        credential: req.agentCredential, id, skuId, patch, expectedVersion, key, hash,
      });
      if (outcome.replay) res.setHeader('Idempotent-Replay', 'true');
      return res.status(outcome.status).json(outcome.body);
    } catch (error) { return errorResponse(res, error); }
  });
};

async function mutateProduct(pool, input) {
  const client = await pool.connect();
  let replayLookup = false;
  try {
    await client.query('BEGIN');
    const previous = await findReplay(client, input);
    if (previous) { await client.query('COMMIT'); return previous; }

    const locked = await client.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [input.id]
    );
    const before = locked.rows[0];
    if (!before) {
      await client.query('COMMIT');
      return { status: 404, body: { error: 'Product not found', code: 'PRODUCT_NOT_FOUND' } };
    }
    if (before.version !== input.expectedVersion) {
      await client.query('COMMIT');
      return { status: 409, body: { error: 'Product version is stale; read it again before updating', code: 'STALE_VERSION', currentVersion: before.version } };
    }

    let result;
    if (input.skuId === null) result = await patchProduct(client, input, before);
    else result = await patchSku(client, input, before);
    if (result.conflict) { await client.query('ROLLBACK'); return result.conflict; }

    const auditValues = [
      input.credential.id, input.credential.name, input.id, input.skuId,
      input.skuId === null ? 'product.update' : 'product.sku.update',
      JSON.stringify(result.oldData), JSON.stringify(result.newData), input.key, input.key, 'committed',
    ];
    await client.query(
      `INSERT INTO agent_audit_events
       (credential_id, actor, product_id, sku_id, action, old_data, new_data, request_id, idempotency_key, result)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`, auditValues
    );
    const body = input.skuId === null
      ? { success: true, product: result.product, version: result.version }
      : { success: true, sku: result.sku, version: result.version };
    try {
      await client.query(
        `INSERT INTO agent_audit_idempotency
         (credential_id, idempotency_key, request_hash, response_status, response_body)
         VALUES ($1,$2,$3,200,$4::jsonb)`,
        [input.credential.id, input.key, input.hash, JSON.stringify(body)]
      );
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'agent_audit_idempotency_pkey') {
        replayLookup = true;
        throw error;
      }
      throw error;
    }
    await client.query('COMMIT');
    return { status: 200, body };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (replayLookup) return findReplay(pool, input);
    throw error;
  } finally { client.release(); }
}

async function findReplay(db, { credential, key, hash }) {
  const result = await db.query(
    `SELECT request_hash, response_status, response_body
       FROM agent_audit_idempotency WHERE credential_id = $1 AND idempotency_key = $2`,
    [credential.id, key]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.request_hash !== hash) {
    return { status: 409, body: { error: 'Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_CONFLICT' } };
  }
  return { status: row.response_status, body: row.response_body, replay: true };
}

async function bumpVersion(client, input) {
  const result = await client.query(
    `UPDATE products SET updated_at = NOW() WHERE id = $1 AND updated_at = $2::timestamptz RETURNING ${VERSION}`,
    [input.id, input.expectedVersion]
  );
  if (!result.rows[0]) return { conflict: { status: 409, body: { error: 'Product version is stale', code: 'STALE_VERSION' } } };
  return { version: result.rows[0].version };
}

async function patchProduct(client, input, before) {
  if (Object.hasOwn(input.patch, 'category_id') && input.patch.category_id !== null) {
    const category = await client.query(
      `SELECT id FROM categories c
        WHERE c.id = $1 AND c.status = 'active' AND c.parent_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = c.id)
        LIMIT 1`, [input.patch.category_id]
    );
    if (!category.rows[0]) {
      return { conflict: { status: 422, body: { error: 'Category must be an existing active leaf', code: 'INVALID_CATEGORY' } } };
    }
  }
  const set = assignments(input.patch);
  const updated = await client.query(
    `UPDATE products SET ${set.sql}, updated_at = NOW()
      WHERE id = $${set.values.length + 1} AND updated_at = $${set.values.length + 2}::timestamptz
      RETURNING ${PRODUCT_COLUMNS}`,
    [...set.values, input.id, input.expectedVersion]
  );
  if (!updated.rows[0]) return { conflict: { status: 409, body: { error: 'Product version is stale', code: 'STALE_VERSION' } } };
  const diff = changedDiff(before, input.patch);
  return { product: updated.rows[0], version: updated.rows[0].version, ...diff };
}

async function patchSku(client, input, beforeProduct) {
  const result = await client.query(
    `SELECT ${SKU_COLUMNS} FROM product_skus WHERE id = $1 AND product_id = $2 FOR UPDATE`,
    [input.skuId, input.id]
  );
  const before = result.rows[0];
  if (!before) {
    await client.query('COMMIT');
    return { conflict: { status: 404, body: { error: 'SKU not found for this product', code: 'SKU_NOT_FOUND' } } };
  }
  const diff = changedDiff(before, input.patch);
  if (Object.hasOwn(input.patch, 'cost_price') && String(before.cost_price) !== String(input.patch.cost_price)) {
    await client.query(
      `INSERT INTO sku_cost_history (sku_id, old_cost_price, new_cost_price, changed_by_admin_id, reason)
       VALUES ($1,$2,$3,NULL,$4)`, [input.skuId, before.cost_price, input.patch.cost_price, `agent_credential:${input.credential.id}`]
    );
  }
  if (Object.hasOwn(input.patch, 'stock')) {
    const warehouse = await client.query(
      `SELECT id FROM inventory_warehouses WHERE is_active = true ORDER BY is_default DESC, id ASC LIMIT 1 FOR UPDATE`
    );
    if (!warehouse.rows[0]) return { conflict: { status: 409, body: { error: 'No active inventory warehouse configured', code: 'INVENTORY_NOT_CONFIGURED' } } };
    const warehouseId = warehouse.rows[0].id;
    await client.query(
      `INSERT INTO inventory_levels (warehouse_id, sku_id, stock) VALUES ($1,$2,0) ON CONFLICT (warehouse_id,sku_id) DO NOTHING`,
      [warehouseId, input.skuId]
    );
    const levels = await client.query(
      `SELECT stock FROM inventory_levels WHERE warehouse_id = $1 AND sku_id = $2 FOR UPDATE`, [warehouseId, input.skuId]
    );
    const total = await client.query('SELECT COALESCE(SUM(stock), 0)::int AS stock FROM inventory_levels WHERE sku_id = $1', [input.skuId]);
    if (total.rows[0].stock !== before.stock) {
      return { conflict: { status: 409, body: { error: 'Inventory total and warehouse levels disagree; reconcile before agent updates', code: 'INVENTORY_RECONCILIATION_REQUIRED' } } };
    }
    const target = input.patch.stock;
    const previousStock = before.stock;
    const delta = target - previousStock;
    const warehouseNext = computeNewStock({ previousStock: levels.rows[0].stock, delta }).newStock;
    if (delta !== 0) {
      await client.query('UPDATE inventory_levels SET stock = $1, updated_at = NOW() WHERE warehouse_id = $2 AND sku_id = $3', [warehouseNext, warehouseId, input.skuId]);
      await client.query(
        `INSERT INTO inventory_transactions (product_id, sku_id, warehouse_id, type, quantity, previous_stock, new_stock, reference_id, note)
         VALUES ($1,$2,$3,'adjustment',$4,$5,$6,NULL,$7)`,
        [input.id, input.skuId, warehouseId, delta, previousStock, target, `agent_credential:${input.credential.id};idempotency:${input.key}`]
      );
    }
    diff.oldData.inventory_warehouse_stock = levels.rows[0].stock;
    diff.newData.inventory_warehouse_id = warehouseId;
    diff.newData.inventory_warehouse_stock = warehouseNext;
  }
  const set = assignments(input.patch);
  const sku = await client.query(
    `UPDATE product_skus SET ${set.sql}, updated_at = NOW()
      WHERE id = $${set.values.length + 1} AND product_id = $${set.values.length + 2}
      RETURNING ${SKU_COLUMNS}`, [...set.values, input.skuId, input.id]
  );
  const version = await bumpVersion(client, input);
  if (version.conflict) return version;
  return { sku: sku.rows[0], version: version.version, ...diff, beforeProduct };
}

module.exports._private = { changedDiff, positiveId, mutateProduct };
