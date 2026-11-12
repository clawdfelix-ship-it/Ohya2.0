'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('order detail modal has its own accessible inline error region', () => {
  const html = fs.readFileSync(path.join(__dirname, '../views/admin/orders.ejs'), 'utf8');
  const alert = html.indexOf('id="order-error"');
  const detail = html.indexOf('id="order-detail"');
  assert.ok(alert > -1 && alert < detail);
  assert.match(html, /id="order-error"[^>]*role="alert"/);
  assert.match(html, /id="order-error"[^>]*aria-live="assertive"/);
});

test('failed status update renders inside the open order modal', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/admin/orders.js'), 'utf8');
  assert.match(source, /orderError:\s*\$\('#order-error'\)/);
  assert.match(source, /els\.modal[^;]*!els\.modal\.classList\.contains\('hidden'\)[\s\S]{0,120}els\.orderError/);
  assert.match(source, /catch \(e\) \{\s*setError\(e && e\.message \? e\.message : String\(e\)\);/);
});

test('successful status update reloads the order and displays success feedback', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/admin/orders.js'), 'utf8');
  const start = source.indexOf("'/api/admin/orders/' + encodeURIComponent(id) + '/status'");
  assert.ok(start > -1);
  const block = source.slice(start, start + 600);
  assert.ok(block.indexOf('await loadOrders()') < block.indexOf('await openOrder(id)'));
  assert.match(block, /showSuccess\(els\.detail, '訂單狀態已更新'\)/);
});
