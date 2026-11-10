'use strict';

/* Opt-in isolated PostgreSQL acceptance. Requires AGENT_TEST_PG_URL; never reads .env. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { generateCredentialSecret, credentialDigest } = require('../lib/agentCredentials');
const { ALL_PRODUCT_SCOPES } = require('../lib/agentProductValidation');
const register = require('../routes/agent-products');

const connectionString = process.env.AGENT_TEST_PG_URL;

test('isolated PostgreSQL: product/SKU partial updates, inventory, concurrency, retry and rollback', { skip: !connectionString }, async (t) => {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 2000 });
  const credential = generateCredentialSecret();
  const credentialId = '123e4567-e89b-42d3-a456-426614174000';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The disposable database has no production tables. Install only the
    // explicit test fixture, never an ambient or production schema.
    await client.query(fs.readFileSync(path.join(__dirname, 'fixtures/agent-product-schema.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/2026-11-10-agent-product-credentials.sql'), 'utf8').replace(/^\s*(BEGIN|COMMIT);/gm, ''));
    await client.query(`INSERT INTO users(id, username, email, password_hash) VALUES (1, 'fixture', 'fixture@example.invalid', 'not-a-password')`);
    await client.query(`INSERT INTO brands(id, name, slug) VALUES (1, 'Fixture brand', 'fixture-brand')`);
    await client.query(`INSERT INTO categories(id, name, slug, status, source, parent_id) VALUES (1, 'Parent', 'parent', 'active', 'storefront', NULL), (11, 'Leaf', 'leaf', 'active', 'storefront', 1)`);
    await client.query(`INSERT INTO products(id, name, name_zh_hk, slug, description_zh_hk, category_id, price, original_price, member_price, cost_price, status, image_url, gallery_images, source, source_key, raw_payload, updated_at) VALUES (7, 'Original', '原本名稱', 'fixture-original', '原本描述', 11, 100, 120, 90, 50, 'active', 'https://i.mzakka.com/old.jpg', '[]', 'mzakka', 'fixture', '{"isEnded":false}', '2026-11-10T00:00:00Z')`);
    await client.query(`INSERT INTO product_skus(id, product_id, sku, barcode, attributes, price, original_price, cost_price, cost_price_jpy, wholesale_price_hkd, stock, is_active, updated_at) VALUES (8, 7, 'FIXTURE-001', '00123', '{"size":"S"}', 100, 120, 50, 1000, 70, 10, true, '2026-11-10T00:00:00Z')`);
    await client.query(`INSERT INTO inventory_warehouses(id, name, is_active, is_default) VALUES (1, 'Fixture warehouse', true, true)`);
    await client.query(`INSERT INTO inventory_levels(warehouse_id, sku_id, stock) VALUES (1, 8, 10)`);
    await client.query(`INSERT INTO agent_api_credentials(id, name, token_prefix, token_hash, scopes, expires_at) VALUES ($1, 'fixture-agent', $2, $3, $4::jsonb, '2099-01-01T00:00:00Z')`, [credentialId, credential.prefix, credentialDigest(credential.secret), JSON.stringify(ALL_PRODUCT_SCOPES)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  t.after(async () => {
    await pool.query(`TRUNCATE agent_audit_events, agent_audit_idempotency, inventory_transactions, inventory_levels, inventory_warehouses, product_skus, products, categories, brands, agent_api_credentials, users RESTART IDENTITY CASCADE`);
    await pool.end();
  });

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  register(app, pool, { allowedImageHosts: ['i.mzakka.com'] });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, url, body, version, key = 'request-local-0001') {
    // Use the exact opaque version projection returned by the API. pg's Date
    // string is not a valid If-Match token and loses timestamp precision.
    const { rows } = await pool.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version FROM products WHERE id = 7`);
    const currentVersion = rows[0].version;
    return fetch(base + url, { method, headers: { authorization: `Bearer ${credential.secret}`, 'content-type': 'application/json', ...(body ? { 'if-match': `"${version || currentVersion}"`, 'idempotency-key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }

  const initial = await request('GET', '/api/agent/products/7');
  assert.equal(initial.status, 200);
  const initialBody = await initial.json();
  assert.equal(initialBody.skus[0].barcode, '00123');
  const stale = await request('PATCH', '/api/agent/products/7', { price: '200.00' }, '2026-01-01T00:00:00Z');
  assert.equal(stale.status, 409);
  const first = await request('PATCH', '/api/agent/products/7', { name_zh_hk: '新名稱', price: '200.00', gallery_images: ['https://i.mzakka.com/new.jpg'] });
  assert.equal(first.status, 200, await first.clone().text());
  const firstBody = await first.json();
  const replay = await request('PATCH', '/api/agent/products/7', { name_zh_hk: '新名稱', price: '200.00', gallery_images: ['https://i.mzakka.com/new.jpg'] }, '2026-01-01T00:00:00Z');
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstBody);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM agent_audit_events')).rows[0].n, 1);
  const product = (await pool.query('SELECT * FROM products WHERE id = 7')).rows[0];
  assert.equal(product.name_zh_hk, '新名稱');
  assert.equal(product.description_zh_hk, '原本描述');
  assert.equal(product.status, 'active');
  assert.equal(product.price, '200.00');

  const sku = await request('PATCH', '/api/agent/products/7/skus/8', { stock: 15, wholesale_price_hkd: '80.00', is_active: false }, null, 'request-local-sku');
  assert.equal(sku.status, 200, await sku.clone().text());
  assert.equal((await pool.query('SELECT stock FROM product_skus WHERE id = 8')).rows[0].stock, 15);
  assert.equal((await pool.query('SELECT stock FROM inventory_levels WHERE sku_id = 8')).rows[0].stock, 15);
  const ledger = (await pool.query('SELECT * FROM inventory_transactions')).rows[0];
  assert.equal(ledger.quantity, 5);
  assert.equal(ledger.previous_stock, 10);
  assert.equal(ledger.new_stock, 15);
  assert.equal((await pool.query('SELECT is_active FROM product_skus WHERE id = 8')).rows[0].is_active, false);

  const cross = await request('PATCH', '/api/agent/products/999/skus/8', { price: '123.00' }, null, 'request-local-cross');
  assert.equal(cross.status, 404);
  assert.equal((await pool.query('SELECT price FROM product_skus WHERE id = 8')).rows[0].price, '100.00');

  await pool.query(`UPDATE agent_api_credentials SET scopes = '["products:read","products:content:write"]' WHERE id = $1`, [credentialId]);
  const forbidden = await request('PATCH', '/api/agent/products/7', { price: '300.00' });
  assert.equal(forbidden.status, 403);
  await pool.query(`UPDATE agent_api_credentials SET scopes = $1 WHERE id = $2`, [JSON.stringify(ALL_PRODUCT_SCOPES), credentialId]);

  const failing = await pool.connect();
  await failing.query(`CREATE OR REPLACE FUNCTION local_fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private fixture SQL failure'; END $$`);
  await failing.query('CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON agent_audit_events FOR EACH ROW EXECUTE FUNCTION local_fixture_fail_audit()');
  failing.release();
  const rollback = await request('PATCH', '/api/agent/products/7', { price: '300.00' }, null, 'request-local-rollback');
  assert.equal(rollback.status, 500);
  assert.equal(JSON.stringify(await rollback.clone().json()).includes('fixture SQL'), false);
  assert.equal((await pool.query('SELECT price FROM products WHERE id = 7')).rows[0].price, '200.00');
  const audits = (await pool.query('SELECT * FROM agent_audit_events')).rows;
  assert.equal(JSON.stringify(audits).includes(credential.secret), false);
  assert.equal(JSON.stringify(audits).toLowerCase().includes('authorization'), false);
});
