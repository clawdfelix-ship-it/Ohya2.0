const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin orders page contains bulk shipany marker', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'orders.ejs'), 'utf8');
  assert.match(s, /批量生成 ShipAny 面單/);
  assert.match(s, /orders-select-all/);
});

test('admin orders js wires bulk shipany behavior', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin', 'orders.js'), 'utf8');
  assert.match(s, /bulkGenerateShipanyLabels/);
  assert.match(s, /\/api\/admin\/shipany\/generate-label/);
});

