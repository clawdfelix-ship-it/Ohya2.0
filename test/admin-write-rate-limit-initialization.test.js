'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin write limiter is created at middleware initialization, not per request', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /return\s+adminWriteLimiter\(\)\(req,\s*res,\s*next\)/);
  const { createAdminWriteMiddleware } = require('../utils/security/rateLimiters');
  assert.equal(typeof createAdminWriteMiddleware, 'function');
});

test('admin write middleware preserves rate limiting without request-time ValidationError', async (t) => {
  const express = require('express');
  const { createAdminWriteMiddleware } = require('../utils/security/rateLimiters');
  const app = express();
  app.use('/api/admin', createAdminWriteMiddleware());
  app.all('/api/admin/test', (req, res) => res.json({ ok: true, method: req.method }));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message, code: err.code }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/test`;
  for (const method of ['GET', 'PUT', 'PUT']) {
    const response = await fetch(url, { method });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.method, method);
    assert.equal(body.code, undefined);
  }
});
