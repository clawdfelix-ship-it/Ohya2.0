'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_EVENTS,
  ALLOWED_STEPS,
  ALLOWED_REFERRER_TYPES,
  ALLOWED_PAGE_TYPES,
  ALLOWED_CONTEXT_KEYS,
  FORBIDDEN_KEYS,
  validateEvent,
  recordEvent,
  orderRef,
  buildFunnelQuery,
} = require('../lib/analyticsEvents');

function ok(payload) {
  const r = validateEvent(payload);
  assert.equal(r.ok, true, `expected ok, got ${r.reason}`);
  return r.event;
}

function bad(payload) {
  const r = validateEvent(payload);
  assert.equal(r.ok, false, 'expected rejection');
  return r.reason;
}

test('event schema：只接受白名單事件', () => {
  for (const e of ALLOWED_EVENTS) {
    const ev = ok({ event: e });
    assert.equal(ev.event, e);
  }
  assert.equal(bad({ event: 'nope' }), 'unsupported event');
  assert.equal(bad({}), 'event is required');
  assert.equal(bad({ event: 'VIEW' }), 'unsupported event'); // 大小寫敏感
  assert.equal(bad(null), 'payload must be an object');
  assert.equal(bad([]), 'payload must be an object');
});

test('event schema：step / page_type / referrer_type 白名單', () => {
  const ev = ok({ event: 'view', step: 'product_view', page_type: 'product', referrer_type: 'google' });
  assert.equal(ev.step, 'product_view');
  assert.equal(ev.page_type, 'product');
  assert.equal(ev.referrer_type, 'google');
  assert.equal(bad({ event: 'view', step: 'evil_step' }), 'unsupported step');
  assert.equal(bad({ event: 'view', page_type: 'secret_page' }), 'unsupported page_type');
  assert.equal(bad({ event: 'view', referrer_type: 'friend' }), 'unsupported referrer_type');
  for (const s of ALLOWED_STEPS) assert.ok(ok({ event: 'view', step: s }).step === s);
  for (const p of ALLOWED_PAGE_TYPES) assert.ok(ok({ event: 'view', page_type: p }).page_type === p);
  for (const r of ALLOWED_REFERRER_TYPES) assert.ok(ok({ event: 'view', referrer_type: r }).referrer_type === r);
});

test('event schema：product_id 必須係正整數，null／空值合法', () => {
  assert.equal(ok({ event: 'view', product_id: 42 }).product_id, 42);
  assert.equal(ok({ event: 'view', product_id: '42' }).product_id, 42);
  assert.equal(ok({ event: 'view', product_id: null }).product_id, null);
  assert.equal(ok({ event: 'view', product_id: '' }).product_id, null);
  assert.equal(ok({ event: 'view' }).product_id, null);
  assert.equal(bad({ event: 'view', product_id: 0 }), 'invalid product_id');
  assert.equal(bad({ event: 'view', product_id: -3 }), 'invalid product_id');
  assert.equal(bad({ event: 'view', product_id: 'abc' }), 'invalid product_id');
});

test('event schema：重複 key 只保留最後一個（JSON 語意）', () => {
  const ev = ok({ event: 'view', product_id: 1, context: { quantity: 1, quantity: 9 } });
  assert.equal(ev.context.quantity, 9);
});

test('event schema：空值／缺值唔會令 payload 變 null', () => {
  const ev = ok({ event: 'search', step: null, page_type: '', category: null, referrer_type: null, session_id: null, context: null });
  assert.equal(ev.step, null);
  assert.equal(ev.page_type, null);
  assert.equal(ev.category, null);
  assert.equal(ev.referrer_type, null);
  assert.equal(ev.session_id, null);
  assert.deepEqual(ev.context, {});
});

test('私隱：context 只准白名單 key，PII key 一律丟走', () => {
  const ev = ok({
    event: 'view',
    context: {
      result_count: 12,
      quantity: 2,
      email: 'a@b.com',
      contact_name: 'Felix',
      contact_phone: '91234567',
      address: 'somewhere',
      user_id: 99,
      ip: '1.2.3.4',
      user_agent: 'UA',
      ua: 'UA',
      fingerprint: 'fp',
      cookie: 'c',
      order_id: 123,
      password: 'x',
    },
  });
  assert.deepEqual(Object.keys(ev.context).sort(), ['quantity', 'result_count']);
  assert.equal(ev.context.email, undefined);
  assert.equal(ev.context.user_id, undefined);
  assert.equal(ev.context.ip, undefined);
  assert.equal(ev.context.order_id, undefined);
  // 白名單以外但唔算 PII 嘅 key 都要丟
  const ev2 = ok({ event: 'view', context: { secret_internal_thing: 1 } });
  assert.deepEqual(ev2.context, {});
});

test('私隱：FORBIDDEN_KEYS 覆蓋所有高風險識別欄位', () => {
  for (const key of ['email', 'ip', 'user_agent', 'ua', 'fingerprint', 'order_id', 'contact_name', 'contact_phone', 'contact_address', 'cookie', 'token', 'password']) {
    assert.ok(FORBIDDEN_KEYS.some((k) => k.toLowerCase() === key), `missing forbidden key: ${key}`);
  }
});

test('私隱：session_id 必須符合格式，category 只准有限字元', () => {
  assert.ok(ok({ event: 'view', session_id: 'abc12345' }).session_id === 'abc12345');
  assert.equal(bad({ event: 'view', session_id: 'short' }), 'invalid session_id');
  assert.equal(bad({ event: 'view', session_id: 'has space here' }), 'invalid session_id');
  assert.equal(bad({ event: 'view', session_id: 'x'.repeat(65) }), 'invalid session_id');
  assert.equal(bad({ event: 'view', category: 'a/b;c' }), 'invalid category');
  assert.equal(bad({ event: 'view', category: 'x'.repeat(65) }), 'invalid category');
  assert.ok(ok({ event: 'view', category: '飛機杯' }).category === '飛機杯');
});

test('私隱：order_ref 係 context 白名單 key（server-side join 用）', () => {
  assert.ok(ALLOWED_CONTEXT_KEYS.includes('order_ref'));
  const ev = ok({ event: 'paid', context: { order_ref: 'a'.repeat(32) } });
  assert.equal(ev.context.order_ref, 'a'.repeat(32));
});

test('order_ref：HMAC 穩定、不可逆、唔等於 order_id', () => {
  const ref = orderRef(123);
  assert.ok(ref && /^[0-9a-f]{32}$/.test(ref), `bad order_ref: ${ref}`);
  assert.equal(ref, orderRef(123));
  assert.notEqual(ref, orderRef(124));
  assert.notEqual(ref, '123');
  assert.ok(!ref.includes('123'));
  assert.equal(orderRef(null), null);
  assert.equal(orderRef(''), null);
  assert.equal(orderRef(undefined), null);
});

test('recordEvent：fail-open（DB throw 都唔會 raise，只 return false）', async () => {
  const boomPool = {
    async query() {
      throw new Error('db down');
    },
  };
  const result = await recordEvent(boomPool, { event: 'view', product_id: 1 });
  assert.equal(result, false);
});

test('recordEvent：正常寫入時帶 order_ref 同 context', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rowCount: 1 };
    },
  };
  const okRes = await recordEvent(
    pool,
    { event: 'checkout_start', step: 'order_created', session_id: 'sess1234', referrer_type: 'google', order_ref: 'r'.repeat(32), context: { item_count: 2 } },
    { context: { order_ref: 'r'.repeat(32) } }
  );
  assert.equal(okRes, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO storefront_events/);
  assert.match(calls[0].sql, /order_ref/);
  assert.equal(calls[0].values[0], 'checkout_start');
  assert.equal(calls[0].values[6], 'sess1234');
  assert.equal(calls[0].values[7], 'r'.repeat(32));
  const ctx = JSON.parse(calls[0].values[8]);
  assert.equal(ctx.item_count, 2);
  assert.equal(ctx.order_ref, 'r'.repeat(32));
});

test('recordEvent：無 pool / 無 event 安全返回 false', async () => {
  assert.equal(await recordEvent(null, { event: 'view' }), false);
  assert.equal(await recordEvent({}, null), false);
});

test('funnel query：分 session 級同 order 級，只准 SELECT', () => {
  const { safeDays, sql, orderSql } = buildFunnelQuery(30);
  assert.equal(safeDays, 30);
  assert.equal(buildFunnelQuery(9999).safeDays, 180);
  assert.equal(buildFunnelQuery('abc').safeDays, 30);
  assert.match(sql, /search_to_view_sessions/);
  assert.match(sql, /view_to_cart_sessions/);
  assert.match(sql, /cart_to_checkout_sessions/);
  assert.match(orderSql, /order_ref/);
  assert.match(orderSql, /orders_paid/);
  for (const q of [sql, orderSql]) {
    assert.ok(!/INSERT|UPDATE|DELETE|DROP/i.test(q), 'funnel query must be read-only');
  }
});
