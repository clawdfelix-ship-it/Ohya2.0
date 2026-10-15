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
  assert.equal(count(app.routes, 'POST', '/api/customizer/sessions/:id/previews'), 1);
  assert.equal(count(app.routes, 'POST', '/api/customizer/sessions/:id/submit'), 1);
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

test('customizer api preview save stores snapshot refs', async () => {
  const app = createRouteCapturingApp();
  const calls = [];
  const fakePool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO customizer_session_previews')) {
        return {
          rows: [{
            session_id: params[0],
            preview_side: params[1],
            storage_key: params[2],
            mime_type: params[3],
            meta_json: JSON.parse(params[4]),
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  customizerApiRoutes(app, fakePool);
  const route = findRoute(app.routes, 'POST', '/api/customizer/sessions/:id/previews');
  const req = {
    params: { id: '18' },
    body: {
      previews: {
        front: {
          storageKey: 'customizer/session-18/front.json',
          mimeType: 'image/png',
          meta: { side: 'front' },
        },
      },
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
  assert.equal(jsonPayload.previews.front.storageKey, 'customizer/session-18/front.json');
  assert.equal(calls.length, 1);
});

test('customizer api submit builds direct order draft when pricing is complete', async () => {
  const app = createRouteCapturingApp();
  const fakePool = {
    query: async (sql, params) => {
      if (sql.includes('FROM customizer_sessions')) {
        return { rows: [{ id: 21, product_type_id: 3, template_id: 8, fulfillment_path: null }] };
      }
      if (sql.includes('FROM customizer_session_designs')) {
        return {
          rows: [{
            session_id: 21,
            design_json: {
              texts: { teamName: 'OHYA', playerName: 'CHAN', playerNumber: '7' },
              logos: [{ assetId: 1, name: 'Club Crest' }],
              zones: [{ zoneKey: 'front-body', color: '#ffffff' }],
            },
          }],
        };
      }
      if (sql.includes('FROM customizer_rosters')) {
        return { rows: [{ id: 44, session_id: 21, total_quantity: 12, meta_json: {} }] };
      }
      if (sql.includes('FROM customizer_roster_items')) {
        return {
          rows: [
            { player_name: 'Chan', player_number: '7', size_code: 'M', quantity: 6, sort_order: 0, meta_json: {} },
            { player_name: 'Lee', player_number: '10', size_code: 'L', quantity: 6, sort_order: 1, meta_json: {} },
          ],
        };
      }
      if (sql.includes('FROM customizer_session_previews')) {
        return {
          rows: [
            { preview_side: 'front', storage_key: 'previews/front.png', mime_type: 'image/png', meta_json: {} },
            { preview_side: 'back', storage_key: 'previews/back.png', mime_type: 'image/png', meta_json: {} },
          ],
        };
      }
      if (sql.includes('FROM customizer_uploaded_assets')) {
        return { rows: [] };
      }
      if (sql.includes('FROM customizer_pricing_rules')) {
        return {
          rows: [
            { rule_type: 'base_unit', pricing_json: { baseUnitPrice: 120, directOrderMaxQuantity: 30, templateAllowsDirectOrder: true } },
            { rule_type: 'quantity_tier', pricing_json: { quantityTiers: [{ min: 10, max: 30, unitAdjustment: -10 }] } },
            { rule_type: 'extra', name: 'Name Print', pricing_json: { code: 'name', label: 'Name Print', unitPrice: 5, appliesTo: 'named-items' } },
          ],
        };
      }
      if (sql.includes('UPDATE customizer_sessions')) {
        return {
          rows: [{
            id: params[0],
            product_type_id: 3,
            template_id: 8,
            fulfillment_path: params[1],
          }],
        };
      }
      if (sql.includes('INSERT INTO customizer_order_drafts')) {
        return { rows: [{ id: 88, session_id: params[0], deliverable_json: JSON.parse(params[1]), note: params[2] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  customizerApiRoutes(app, fakePool);
  const route = findRoute(app.routes, 'POST', '/api/customizer/sessions/:id/submit');
  const req = {
    params: { id: '21' },
    body: { mode: 'direct_order', note: 'ready to go' },
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
  assert.equal(jsonPayload.mode, 'direct_order');
  assert.equal(jsonPayload.orderDraft.id, 88);
  assert.equal(jsonPayload.pricing.fulfillmentPath, 'direct_order');
});
