'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const registerAnalytics = require('../routes/analytics');

function createApp(options = {}) {
  const state = {
    inserts: [],
    queries: [],
    failInsert: !!options.failInsert,
    sessionRows: options.sessionRows || [],
  };

  const pool = {
    async query(sql, values = []) {
      state.queries.push({ sql, values });
      if (/INSERT INTO storefront_events/i.test(sql)) {
        if (state.failInsert) throw new Error('db down');
        state.inserts.push({ sql, values });
        return { rowCount: 1 };
      }
      if (/FROM storefront_events/i.test(sql)) {
        return { rows: state.sessionRows };
      }
      return { rows: [] };
    },
  };

  const app = express();
  app.use(express.json({ limit: '16kb' }));
  // 模擬 session（requirePermission 需要 session.userId）
  app.use((req, res, next) => {
    req.session = options.adminSession
      ? { userId: 1, isAdmin: true, adminPermissions: [] }
      : {};
    next();
  });
  registerAnalytics(app, pool);
  return { app, state };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

test('POST /api/analytics/event：合法事件 → 202 並寫入', async () => {
  const { app, state } = createApp();
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'view',
        product_id: 12,
        step: 'product_view',
        page_type: 'product',
        referrer_type: 'google',
        session_id: 'abc12345',
        context: { result_count: 3 },
      }),
    });
    assert.equal(res.status, 202);
    assert.equal(state.inserts.length, 1);
    const values = state.inserts[0].values;
    assert.equal(values[0], 'view');
    assert.equal(values[1], 12);
    assert.equal(values[6], 'abc12345');
  } finally {
    await local.close();
  }
});

test('POST /api/analytics/event：非法 event → 400，唔會寫入', async () => {
  const { app, state } = createApp();
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'drop_table', product_id: 1 }),
    });
    assert.equal(res.status, 400);
    assert.equal(state.inserts.length, 0);
  } finally {
    await local.close();
  }
});

test('POST /api/analytics/event：PII context key 被丟走', async () => {
  const { app, state } = createApp();
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'view',
        context: { email: 'x@y.com', user_id: 5, ip: '1.2.3.4', result_count: 7 },
      }),
    });
    assert.equal(res.status, 202);
    const ctx = JSON.parse(state.inserts[0].values[8]);
    assert.deepEqual(ctx, { result_count: 7 });
  } finally {
    await local.close();
  }
});

test('POST /api/analytics/event：DB 失敗 → 仍然 202（fail-open，唔影響下單）', async () => {
  const { app } = createApp({ failInsert: true });
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'add_to_cart', product_id: 3 }),
    });
    assert.equal(res.status, 202);
  } finally {
    await local.close();
  }
});

test('POST /api/analytics/event：rate limit 生效（超過上限 → 429）', async () => {
  const { app } = createApp();
  const local = await listen(app);
  try {
    let limited = false;
    for (let i = 0; i < 140; i += 1) {
      const res = await fetch(`${local.url}/api/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'view', product_id: i + 1 }),
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    assert.ok(limited, 'expected rate limit to kick in');
  } finally {
    await local.close();
  }
});

test('GET /api/admin/analytics/funnel：無權限 → 401', async () => {
  const { app } = createApp();
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/admin/analytics/funnel`);
    assert.equal(res.status, 401);
  } finally {
    await local.close();
  }
});

test('GET /api/admin/analytics/funnel：admin 可讀，回傳逐日／逐來源同四個轉化率', async () => {
  const { app, state } = createApp({
    adminSession: true,
    sessionRows: [
      {
        day: '2026-11-15',
        source: 'google',
        sessions: 10,
        search_sessions: 8,
        search_to_view_sessions: 4,
        view_sessions: 6,
        view_to_cart_sessions: 3,
        cart_sessions: 3,
        cart_to_checkout_sessions: 2,
        checkout_sessions: 2,
        orders_created: 2,
        orders_with_proof: 1,
        orders_paid: 1,
      },
    ],
  });
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/admin/analytics/funnel?days=30`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.days, 30);
    assert.ok(body.by_day['2026-11-15']);
    assert.ok(body.by_source.google);
    const src = body.by_source.google;
    assert.equal(src.search_to_view_rate, 0.5); // 4/8
    assert.equal(src.view_to_cart_rate, 0.5); // 3/6
    assert.equal(src.cart_to_checkout_rate, 0.6667); // 2/3
    assert.equal(src.checkout_to_paid_rate, 0.5); // 1/2
    assert.ok(body.totals);
    // 只讀：全部 SELECT
    for (const q of state.queries) {
      assert.ok(!/INSERT|UPDATE|DELETE|DROP/i.test(q.sql), 'funnel endpoint must be read-only');
    }
  } finally {
    await local.close();
  }
});

test('GET /api/admin/analytics/funnel：source filter 生效', async () => {
  const { app } = createApp({
    adminSession: true,
    sessionRows: [
      { day: '2026-11-15', source: 'google', sessions: 5, search_sessions: 1, search_to_view_sessions: 1, view_sessions: 1, view_to_cart_sessions: 1, cart_sessions: 1, cart_to_checkout_sessions: 1, checkout_sessions: 1, orders_created: 0, orders_with_proof: 0, orders_paid: 0 },
      { day: '2026-11-15', source: 'direct', sessions: 7, search_sessions: 0, search_to_view_sessions: 0, view_sessions: 2, view_to_cart_sessions: 0, cart_sessions: 0, cart_to_checkout_sessions: 0, checkout_sessions: 0, orders_created: 0, orders_with_proof: 0, orders_paid: 0 },
    ],
  });
  const local = await listen(app);
  try {
    const res = await fetch(`${local.url}/api/admin/analytics/funnel?source=direct`);
    const body = await res.json();
    assert.deepEqual(Object.keys(body.by_source), ['direct']);
    assert.equal(body.by_source.direct.sessions, 7);
  } finally {
    await local.close();
  }
});
