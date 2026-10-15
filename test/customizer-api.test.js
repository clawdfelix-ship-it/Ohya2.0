const test = require('node:test');
const assert = require('node:assert/strict');

const customizerApiRoutes = require('../routes/customizerApi');

function createRouteCapturingApp() {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  return {
    routes,
    get: record('GET'),
    post: record('POST'),
    put: record('PUT'),
    use: () => {},
  };
}

function count(routes, method, routePath) {
  return routes.filter((route) => route.method === method && route.path === routePath).length;
}

function findRoute(routes, method, routePath) {
  const route = routes.find((entry) => entry.method === method && entry.path === routePath);
  assert.ok(route, `Missing route ${method} ${routePath}`);
  return route;
}

test('customizer api registers catalog and session endpoints', () => {
  const app = createRouteCapturingApp();
  const fakePool = { query: async () => ({ rows: [] }) };

  customizerApiRoutes(app, fakePool);

  assert.equal(count(app.routes, 'GET', '/api/customizer/catalog'), 1);
  assert.equal(count(app.routes, 'GET', '/api/customizer/product-types/:id/templates'), 1);
  assert.equal(count(app.routes, 'GET', '/api/customizer/templates/:id'), 1);
  assert.equal(count(app.routes, 'GET', '/api/customizer/assets'), 1);
  assert.equal(count(app.routes, 'POST', '/api/customizer/sessions'), 1);
  assert.equal(count(app.routes, 'GET', '/api/customizer/sessions/:id'), 1);
  assert.equal(count(app.routes, 'PUT', '/api/customizer/sessions/:id/design'), 1);
  assert.equal(count(app.routes, 'PUT', '/api/customizer/sessions/:id/roster'), 1);
});

test('customizer api create session persists session and design payload', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const fakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO customizer_sessions')) {
        return { rows: [{ id: 42, session_token: 'token-42', product_type_id: params[1], template_id: params[2] }] };
      }
      if (sql.includes('INSERT INTO customizer_session_designs')) {
        return { rows: [{ session_id: params[0], design_json: JSON.parse(params[1]) }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  customizerApiRoutes(app, fakePool);
  const route = findRoute(app.routes, 'POST', '/api/customizer/sessions');
  const req = {
    body: {
      productTypeId: 3,
      templateId: 8,
      design: { zones: [{ zoneKey: 'front-body', color: '#ffffff' }] },
    },
  };

  let statusCode = 200;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
    },
  };

  await route.handlers[0](req, res);

  assert.equal(statusCode, 201);
  assert.equal(jsonPayload.session.id, 42);
  assert.equal(jsonPayload.design.zones.length, 1);
  assert.equal(calls.length, 2);
});

test('customizer api design update persists selection and design payload', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const fakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('UPDATE customizer_sessions')) {
        return {
          rows: [{
            id: params[0],
            product_type_id: params[1],
            template_id: params[2],
          }],
        };
      }
      if (sql.includes('INSERT INTO customizer_session_designs')) {
        return {
          rows: [{
            session_id: params[0],
            design_json: JSON.parse(params[1]),
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  customizerApiRoutes(app, fakePool);
  const route = findRoute(app.routes, 'PUT', '/api/customizer/sessions/:id/design');
  const req = {
    params: { id: '17' },
    body: {
      productTypeId: 5,
      templateId: 12,
      design: { texts: { frontName: 'OHYA FC' } },
    },
  };

  let statusCode = 200;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
    },
  };

  await route.handlers[0](req, res);

  assert.equal(statusCode, 200);
  assert.equal(jsonPayload.session.product_type_id, 5);
  assert.equal(jsonPayload.session.template_id, 12);
  assert.equal(jsonPayload.design.design_json.texts.frontName, 'OHYA FC');
  assert.equal(calls.length, 2);
});
