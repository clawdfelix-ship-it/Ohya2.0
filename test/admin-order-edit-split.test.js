const test = require('node:test');
const assert = require('node:assert/strict');

function createApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => routes.push({ method, path, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    delete: record('DELETE'),
  };
}

function findRoute(app, method, path) {
  const route = app.routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(route, `Missing route ${method} ${path}`);
  return route;
}

test('split order aggregates duplicate order_item_id quantities before validation', async () => {
  const app = createApp();
  let itemSelectCount = 0;
  let rolledBack = false;

  const client = {
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text === 'BEGIN') return { rows: [] };
      if (text === 'ROLLBACK') {
        rolledBack = true;
        return { rows: [] };
      }
      if (text === 'SELECT * FROM orders WHERE id=$1') {
        return {
          rows: [{
            id: 1,
            subtotal_amount: 100,
            discount_amount: 0,
            coupon_discount: 0,
            shipping_fee: 0,
            payment_method_code: 'fps_payme',
            is_cod: false,
          }],
        };
      }
      if (text === 'SELECT * FROM order_items WHERE id=$1 AND order_id=$2') {
        itemSelectCount += 1;
        assert.deepEqual(params, [10, 1]);
        return {
          rows: [{
            id: 10,
            order_id: 1,
            product_id: 200,
            sku_id: 300,
            product_name: '測試商品',
            sku_attributes: '{}',
            quantity: 5,
            unit_price: 20,
          }],
        };
      }
      if (text.includes('FROM order_fulfillment_items offi')) {
        return { rows: [{ q: 0 }] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  require('../routes/admin-order-edit')(app, pool);
  const route = findRoute(app, 'POST', '/api/admin/orders/:id/split');
  const handler = route.handlers[1];

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handler({
    params: { id: '1' },
    body: {
      items: [
        { order_item_id: 10, quantity: 3 },
        { order_item_id: 10, quantity: 3 },
      ],
    },
    session: { userId: 9 },
  }, res);

  assert.equal(itemSelectCount, 1);
  assert.equal(rolledBack, true);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /可分數量只有 5 件/);
});
