const test = require('node:test');
const assert = require('node:assert/strict');
const { computeNewStock } = require('../lib/inventory');

test('computeNewStock rejects negative result', () => {
  assert.throws(() => computeNewStock({ previousStock: 2, delta: -3 }), /stock cannot go below 0/i);
});

test('computeNewStock returns new stock', () => {
  assert.deepEqual(computeNewStock({ previousStock: 2, delta: 3 }), { previousStock: 2, newStock: 5 });
});

