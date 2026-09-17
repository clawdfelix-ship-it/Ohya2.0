const test = require('node:test');
const assert = require('node:assert/strict');

const registerOrdersRoutes = require('../routes/orders');

function createFakeApp() {
  const routes = {
    get: new Map(),
    post: new Map(),
    put: new Map(),
  };

  return {
    routes,
    get(path, ...handlers) {
      routes.get.set(path, handlers);
    },
    post(path, ...handlers) {
      routes.post.set(path, handlers);
    },
    put(path, ...handlers) {
      routes.put.set(path, handlers);
    },
  };
}

function createFakeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

test('checkout re-validates locked stock and rejects oversold carts', async () => {
  const app = createFakeApp();
  const queries = [];
  let released = false;

  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (/FROM cart_items ci[\s\S]*FOR UPDATE OF p/i.test(sql)) {
        return {
          rows: [
            { product_id: 88, quantity: 2, stock: 1, price: 5000, name: '限量商品' },
          ],
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  registerOrdersRoutes(app, pool, () => {}, () => {});
  const createOrder = app.routes.post.get('/api/orders').at(-1);

  const req = {
    session: { userId: 7 },
    body: {
      contact_name: '測試用戶',
      contact_phone: '12345678',
      contact_address: '香港測試地址',
      note: '',
    },
  };
  const res = createFakeResponse();

  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: '產品 限量商品 庫存不足' });
  assert.equal(released, true);
  assert.ok(queries.some(({ sql }) => /FOR UPDATE OF p/i.test(sql)));
  assert.equal(queries.some(({ sql }) => /INSERT INTO orders/i.test(sql)), false);
});
