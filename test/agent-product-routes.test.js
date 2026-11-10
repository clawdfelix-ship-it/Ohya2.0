'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { generateCredentialSecret, credentialDigest } = require('../lib/agentCredentials');
const registerAgentProducts = require('../routes/agent-products');

const allScopes = ['products:read', 'products:content:write', 'products:media:write', 'products:classification:write', 'products:variants:write', 'products:pricing:write', 'products:cost:write', 'products:status:write', 'inventory:write'];
const credential = generateCredentialSecret();
const credentialId = '123e4567-e89b-42d3-a456-426614174000';
const timestamp = '2026-11-10T00:00:00.000Z';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function productRow(product) {
  // Mirror the route's to_char(...) AS version projection.
  return { ...clone(product), version: product.updated_at };
}

function createFixture() {
  const state = {
    product: {
      id: 7, name: 'Original', name_zh_hk: '原本名稱', slug: 'fixture-original', description_zh_hk: '原本描述',
      category_id: 11, brand_id: 2, image_url: 'https://i.mzakka.com/old.jpg', gallery_images: [],
      price: '100.00', original_price: '120.00', member_price: '90.00', cost_price: '50.00',
      status: 'active', is_featured: false, source: 'manual', updated_at: timestamp,
    },
    sku: {
      id: 8, product_id: 7, sku: 'FIXTURE-001', barcode: '00123', attributes: { size: 'S' },
      price: '100.00', original_price: '120.00', cost_price: '50.00', cost_price_jpy: '1000.00', wholesale_price_hkd: '70.00',
      stock: 10, weight: '100.00', weight_unit: 'g', is_active: true, updated_at: timestamp,
    },
    levels: [{ warehouse_id: 1, sku_id: 8, stock: 10 }],
    transactions: [], costHistory: [], audits: [], idempotency: [],
    category: { id: 11, status: 'active', source: 'storefront', parent_id: 1, hasChildren: false },
    credential: { id: credentialId, name: 'fixture-agent', token_prefix: credential.prefix, token_hash: credentialDigest(credential.secret), scopes: allScopes, expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null },
    lastUsed: 0, commits: 0, rollbacks: 0, failAudit: false, failCommit: false,
  };

  const pool = {
    async query(sql, values = []) {
      if (/FROM agent_api_credentials/.test(sql) && /token_prefix/.test(sql)) {
        return { rows: state.credential.token_prefix === values[0] ? [clone(state.credential)] : [] };
      }
      if (/UPDATE agent_api_credentials/.test(sql)) { state.lastUsed++; return { rows: [] }; }
      // Read-only endpoint and post-rollback idempotency lookup use the pool.
      if (/^\s*SELECT[\s\S]*FROM products\s/.test(sql) && !/FOR UPDATE/.test(sql)) return { rows: [productRow(state.product)] };
      if (/^\s*SELECT[\s\S]*FROM product_skus/.test(sql) && !/FOR UPDATE/.test(sql)) return { rows: state.sku ? [clone(state.sku)] : [] };
      if (/FROM agent_audit_idempotency/.test(sql) && /^\s*SELECT/.test(sql)) return findReplay(state.idempotency, values);
      throw new Error('Unexpected pool SQL: ' + sql);
    },
    async connect() {
      const work = clone(state);
      let inTransaction = false;
      let transactionHasWrites = false;
      const client = {
        async query(sql, values = []) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          if (/^BEGIN$/.test(normalized)) { inTransaction = true; return { rows: [] }; }
          if (/^COMMIT$/.test(normalized)) {
            if (work.failCommit) throw new Error('private commit failure');
            if (inTransaction) {
              Object.assign(state, work);
              // COMMIT is also used to end read-only stale/replay transactions.
              // Count only transactions that actually attempted a mutation.
              if (transactionHasWrites) state.commits++;
              inTransaction = false;
            }
            return { rows: [] };
          }
          if (/^ROLLBACK$/.test(normalized)) {
            if (inTransaction) { state.rollbacks++; inTransaction = false; }
            return { rows: [] };
          }
          if (!inTransaction) throw new Error('Mutating fixture query outside a transaction: ' + normalized);

          if (/^\s*SELECT[\s\S]*FROM products\s/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: [productRow(work.product)] };
          if (/^\s*SELECT[\s\S]*FROM product_skus/.test(sql) && /FOR UPDATE/.test(sql)) {
            return { rows: work.sku && work.sku.product_id === values[1] ? [clone(work.sku)] : [] };
          }
          if (/^\s*SELECT[\s\S]*FROM categories c/.test(sql)) {
            return { rows: work.category && work.category.id === values[0] && work.category.status === 'active' && work.category.parent_id !== null && !work.category.hasChildren ? [{ id: work.category.id }] : [] };
          }
          if (/FROM agent_audit_idempotency/.test(sql) && /^\s*SELECT/.test(sql)) return findReplay(work.idempotency, values);
          if (/^\s*UPDATE products SET/.test(sql) && /RETURNING/.test(sql)) {
            transactionHasWrites = true;
            const setClause = normalized.match(/^UPDATE products SET (.*?) WHERE /)[1];
            const assignments = setClause.split(', ');
            const expectedVersion = values[assignments.length];
            if (work.product.updated_at !== expectedVersion) return { rows: [] };
            for (let index = 0; index < assignments.length; index++) {
              const field = assignments[index].split(' = ')[0];
              if (field !== 'updated_at') work.product[field] = decodeJsonValue(values[index], field);
            }
            work.product.updated_at = '2026-11-10T00:00:01.000Z';
            return { rows: [productRow(work.product)] };
          }
          if (/^\s*SELECT id FROM inventory_warehouses/.test(sql)) return { rows: [{ id: 1 }] };
          if (/^\s*INSERT INTO inventory_levels/.test(sql)) {
            if (!work.levels.some((level) => level.warehouse_id === values[0] && level.sku_id === values[1])) work.levels.push({ warehouse_id: values[0], sku_id: values[1], stock: 0 });
            return { rows: [] };
          }
          if (/^\s*SELECT stock FROM inventory_levels/.test(sql)) {
            const level = work.levels.find((item) => item.warehouse_id === values[0] && item.sku_id === values[1]);
            return { rows: level ? [{ stock: level.stock }] : [] };
          }
          if (/^\s*SELECT COALESCE\(SUM\(stock\), 0\)::int AS stock FROM inventory_levels/.test(sql)) {
            return { rows: [{ stock: work.levels.filter((level) => level.sku_id === values[0]).reduce((sum, level) => sum + level.stock, 0) }] };
          }
          if (/^\s*UPDATE inventory_levels SET/.test(sql)) {
            const level = work.levels.find((item) => item.warehouse_id === values[1] && item.sku_id === values[2]);
            if (level) level.stock = values[0];
            return { rows: [] };
          }
          if (/^\s*INSERT INTO inventory_transactions/.test(sql)) {
            work.transactions.push({ product_id: values[0], sku_id: values[1], warehouse_id: values[2], quantity: values[3], previous_stock: values[4], new_stock: values[5], note: values[6] });
            return { rows: [] };
          }
          if (/^\s*INSERT INTO sku_cost_history/.test(sql)) {
            work.costHistory.push({ sku_id: values[0], old_cost_price: values[1], new_cost_price: values[2], reason: values[3] });
            return { rows: [] };
          }
          if (/^\s*UPDATE product_skus SET/.test(sql)) {
            transactionHasWrites = true;
            const setClause = normalized.match(/^UPDATE product_skus SET (.*?) WHERE /)[1];
            const assignments = setClause.split(', ');
            for (let index = 0; index < assignments.length; index++) {
              const field = assignments[index].split(' = ')[0];
              if (field !== 'updated_at') work.sku[field] = decodeJsonValue(values[index], field);
            }
            work.sku.updated_at = '2026-11-10T00:00:01.000Z';
            return { rows: [clone(work.sku)] };
          }
          if (/^\s*INSERT INTO agent_audit_events/.test(sql)) {
            if (work.failAudit) throw new Error('private audit SQL failure');
            const row = { id: work.audits.length + 1, credential_id: values[0], actor: values[1], product_id: values[2], sku_id: values[3], action: values[4], old_data: JSON.parse(values[5]), new_data: JSON.parse(values[6]), request_id: values[7], idempotency_key: values[8], result: values[9] };
            work.audits.push(row);
            return { rows: [clone(row)] };
          }
          if (/^\s*INSERT INTO agent_audit_idempotency/.test(sql)) {
            const [cred, key, requestHash, responseBody] = values;
            if (work.idempotency.some((item) => item.credential_id === cred && item.idempotency_key === key)) throw Object.assign(new Error('duplicate'), { code: '23505', constraint: 'agent_audit_idempotency_pkey' });
            work.idempotency.push({ credential_id: cred, idempotency_key: key, request_hash: requestHash, response_status: 200, response_body: JSON.parse(responseBody) });
            return { rows: [] };
          }
          throw new Error('Unhandled fixture SQL: ' + normalized);
        },
        release() {},
      };
      return client;
    },
  };
  return { state, pool };
}

function decodeJsonValue(value, field) {
  // pg returns numeric/decimal columns as strings; only JSON columns are decoded.
  if (!['attributes', 'gallery_images'].includes(field) || typeof value !== 'string') return value;
  return JSON.parse(value);
}

function findReplay(records, values) {
  const row = records.find((item) => item.credential_id === values[0] && item.idempotency_key === values[1]);
  return { rows: row ? [clone(row)] : [] };
}

async function makeApp(fixture) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  registerAgentProducts(app, fixture.pool, { allowedImageHosts: ['i.mzakka.com'] });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function options(method, body, key = credential.secret, expectedVersion = timestamp) {
  return {
    method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(expectedVersion ? { 'if-match': `"${expectedVersion}"` } : {}), ...(body ? { 'idempotency-key': 'request-fixture-001' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

test('GET reads product, SKUs and exact version with credential only', async (t) => {
  const fixture = createFixture();
  const local = await makeApp(fixture); t.after(local.close);
  const res = await fetch(`${local.url}/api/agent/products/7`, options('GET'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('etag'), `"${timestamp}"`);
  assert.equal(body.product.id, 7);
  assert.equal(body.skus[0].id, 8);
  assert.equal(body.version, timestamp);
  assert.equal(res.headers.get('set-cookie'), null);
  const invalid = await fetch(`${local.url}/api/agent/products/nope`, options('GET'));
  assert.equal(invalid.status, 422);
});

test('content PATCH preserves omitted fields and creates safe audit', async (t) => {
  const fixture = createFixture();
  const local = await makeApp(fixture); t.after(local.close);
  const res = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { name_zh_hk: '新名稱' }));
  assert.equal(res.status, 200, await res.text());
  assert.equal(fixture.state.product.name_zh_hk, '新名稱');
  assert.equal(fixture.state.product.price, '100.00');
  assert.equal(fixture.state.product.description_zh_hk, '原本描述');
  assert.equal(fixture.state.product.status, 'active');
  assert.equal(fixture.state.sku.stock, 10);
  assert.equal(fixture.state.commits, 1);
  const audit = fixture.state.audits[0];
  assert.equal(audit.credential_id, credentialId);
  assert.equal(audit.product_id, 7);
  assert.deepEqual(audit.old_data, { name_zh_hk: '原本名稱' });
  assert.deepEqual(audit.new_data, { name_zh_hk: '新名稱' });
  assert.equal(JSON.stringify(fixture.state.audits).includes(credential.secret), false);
  assert.equal(JSON.stringify(fixture.state.audits).includes('authorization'), false);
});

test('stale version returns 409 without writes; idempotent retry returns same response once', async (t) => {
  const fixture = createFixture();
  const local = await makeApp(fixture); t.after(local.close);
  const stale = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { price: '200.00' }, credential.secret, '2026-01-01T00:00:00.000Z'));
  assert.equal(stale.status, 409);
  assert.equal(fixture.state.product.price, '100.00');
  const first = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { price: '200.00' }));
  const firstBody = await first.json();
  const replay = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { price: '200.00' }, credential.secret, '2026-01-01T00:00:00.000Z'));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstBody);
  assert.equal(fixture.state.commits, 1, 'stale checks and replay reads must not repeat the write');
  assert.equal(fixture.state.audits.length, 1);
  const conflict = await fetch(`${local.url}/api/agent/products/7`, { ...options('PATCH', { price: '201.00' }), headers: { ...options('PATCH', { price: '201.00' }).headers, 'idempotency-key': 'request-fixture-001' } });
  assert.equal(conflict.status, 409);
});

test('SKU stock adjusts total, selected warehouse level and ledger atomically; cross-product rejected', async (t) => {
  const fixture = createFixture();
  const local = await makeApp(fixture); t.after(local.close);
  const res = await fetch(`${local.url}/api/agent/products/7/skus/8`, options('PATCH', { stock: 15, price: '110.00', wholesale_price_hkd: '80.00' }));
  assert.equal(res.status, 200, await res.text());
  assert.equal(fixture.state.sku.stock, 15);
  assert.equal(fixture.state.levels[0].stock, 15);
  assert.equal(fixture.state.transactions.length, 1);
  assert.equal(fixture.state.transactions[0].quantity, 5);
  assert.equal(fixture.state.transactions[0].previous_stock, 10);
  assert.equal(fixture.state.transactions[0].new_stock, 15);
  assert.equal(fixture.state.sku.price, '110.00');
  assert.equal(fixture.state.sku.barcode, '00123');
  fixture.state.sku.product_id = 999;
  const cross = await fetch(`${local.url}/api/agent/products/7/skus/8`, {
    ...options('PATCH', { price: '120.00' }, credential.secret, fixture.state.product.updated_at),
    headers: {
      ...options('PATCH', { price: '120.00' }, credential.secret, fixture.state.product.updated_at).headers,
      'idempotency-key': 'request-fixture-cross-product',
    },
  });
  assert.equal(cross.status, 404);
  assert.equal(fixture.state.sku.price, '110.00');
});

test('scope, unknown fields, validation, audit failure and DB errors fail safely', async (t) => {
  const fixture = createFixture();
  const local = await makeApp(fixture); t.after(local.close);
  fixture.state.credential.scopes = ['products:read', 'products:content:write'];
  const forbidden = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { price: '1.00' }));
  assert.equal(forbidden.status, 403);
  assert.equal(fixture.state.product.price, '100.00');
  fixture.state.credential.scopes = allScopes;
  const unknown = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { orders: [] }));
  assert.equal(unknown.status, 422);
  const negative = await fetch(`${local.url}/api/agent/products/7/skus/8`, options('PATCH', { stock: -1 }));
  assert.equal(negative.status, 422);
  fixture.state.failAudit = true;
  const failed = await fetch(`${local.url}/api/agent/products/7`, options('PATCH', { price: '200.00' }));
  assert.equal(failed.status, 500);
  assert.equal(fixture.state.product.price, '100.00');
  assert.equal(fixture.state.rollbacks > 0, true);
  assert.equal(JSON.stringify(await failed.json()).includes('SQL'), false);
});
