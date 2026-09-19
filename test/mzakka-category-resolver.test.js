'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveItemNode } = require('../utils/mzakkaCategoryResolver');

test('resolver maps a known item id from the precomputed leaf map', () => {
  // M12500 was the canonical example: onahole -> タイプ・サイズ別 -> 大型ホール(2816)
  const r = resolveItemNode({ id: 'M12500', category: 'オナホール・おっぱい > メーカー別 > ...' });
  assert.equal(r.via, 'map');
  assert.ok(typeof r.nodeId === 'number');
});

test('unknown item falls back to a real root parsed from breadcrumb string', () => {
  const r = resolveItemNode({ id: 'ZZZ_UNKNOWN_9999', category: 'コンドーム > 何か > メーカー別 > X' });
  assert.equal(r.nodeId, 1826);
  assert.equal(r.via, 'root-fallback');
});

test('promo prefix (アダルトグッズ実演販売) is stripped before root fallback', () => {
  const r = resolveItemNode({ id: 'ZZZ_UNKNOWN_9998', category: 'アダルトグッズ実演販売 > バイブ・電マ・ディルド > デンマ' });
  assert.equal(r.nodeId, 1811);
});

test('truly unknown item returns null instead of inventing a category', () => {
  const r = resolveItemNode({ id: 'ZZZ_UNKNOWN_9997', category: '未分類' });
  assert.equal(r.nodeId, null);
  assert.equal(r.via, null);
});

test('slim map + taxonomy data files are present and well-formed', () => {
  const tax = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'mzakka-taxonomy.json'), 'utf8'));
  assert.equal(tax.roots.length, 13);
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'mzakka-item-leaf-map.json'), 'utf8'));
  assert.ok(Object.keys(map.items).length > 30000);
});
