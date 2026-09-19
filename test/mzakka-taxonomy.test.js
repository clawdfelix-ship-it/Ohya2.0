'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../scripts/lib/mzakka-taxonomy');

const CACHE = path.join(__dirname, '..', 'tmp', 'mzakka-tax-cache');
const readCache = (id) => fs.readFileSync(path.join(CACHE, `cat-${id}.html`), 'utf8');

test('1801: only タイプ・サイズ別(2810) survives; facet groups & brands dropped', () => {
  const html = readCache(1801);
  const { children, dropped } = lib.extractRootChildren(html, 1801, { makerIds: new Set() });
  const ids = children.map((c) => c.id);
  assert.ok(ids.includes(2810), '2810 タイプ・サイズ別 must be a real group');
  for (const facet of [2108, 1934, 2811, 2812, 2813, 1807]) {
    assert.ok(!ids.includes(facet), `facet ${facet} must not be a child`);
  }
  const droppedIds = dropped.map((d) => d.id);
  for (const facet of [2108, 1934, 2811, 2812, 2813, 1807]) {
    assert.ok(droppedIds.includes(facet), `facet ${facet} should be reported dropped`);
  }
});

test('1801 group page 2810 exposes the 7+ real type leaves incl. required 2814..2824', () => {
  const html = readCache(2810);
  const { children } = lib.extractRootChildren(html, 1801, { makerIds: new Set() });
  const ids = new Set(children.map((c) => c.id));
  for (const required of [2814, 2815, 2820, 2821, 2822, 2823, 2824]) {
    assert.ok(ids.has(required), `required type leaf ${required} missing`);
  }
  // facet leaves from other groups must not leak in via 2810 page
  for (const facet of [2825, 2843, 2851]) {
    assert.ok(!ids.has(facet), `facet leaf ${facet} leaked into 2810 children`);
  }
});

test('attribute facet leaves 2825 / 2843 / 2851 are classified as facets', () => {
  for (const [id, name] of [
    [2825, 'ヒダ系'],
    [2843, 'ハード素材'],
    [2851, '三次元写真'],
  ]) {
    assert.equal(lib.classifyChild({ id, name }, 1801).real, false, `${id} ${name}`);
  }
});

test('condom brands in 1826 #sub are dropped; real types kept', () => {
  const html = readCache(1826);
  const makerIds = lib.extractMakerIds(readCache(1792));
  const { children } = lib.extractRootChildren(html, 1826, { makerIds });
  const ids = new Set(children.map((c) => c.id));
  for (const brand of [2494, 2495, 2496, 2497]) assert.ok(!ids.has(brand), `brand ${brand}`);
  assert.ok(!ids.has(2126), 'ranking 2126');
  for (const real of [2506, 1827, 1828, 1829, 1830, 2290, 2505, 2412]) {
    assert.ok(ids.has(real), `real type ${real} missing`);
  }
});

test('breadcrumb parser: category page single chain with current strong node', () => {
  const chain = lib.extractCategoryBreadcrumb(readCache(2814), 2814);
  assert.deepEqual(chain.map((x) => x.id), [1801, 2810, 2814]);
  assert.equal(chain[2].name, '中型・大型トルソーホール');
});

test('item breadcrumb: multi-chain split and facet chains detectable', () => {
  const html = fs.readFileSync(path.join(CACHE, 'item-M12500.html'), 'utf8');
  const chains = lib.extractItemBreadcrumbChains(html);
  assert.ok(chains.length >= 5, 'item should have many chains');
  // there is a real type chain 1801 > 2810 > 2816
  const typeChain = chains.find((c) => c[0] && c[0].id === 1801 && c[1] && c[1].id === 2810);
  assert.ok(typeChain, '1801 > 2810 type chain present');
  assert.equal(typeChain[2].id, 2816);
  // and a maker chain 1801 > 1934 > brand
  assert.ok(chains.some((c) => c[1] && c[1].id === 1934));
});

test('item links carry the page category id; paging parse', () => {
  const links = lib.extractItemLinks(readCache(1826));
  assert.ok(links.length >= 100);
  assert.ok(links.every((l) => l.category === 1826));
  const paging = lib.extractPaging(readCache(1826));
  assert.equal(paging.total, 537);
  assert.equal(paging.pages, 3);
});

test('canonical leaf: M12500 -> 2816 大型ホール (タイプ chain, not facet)', () => {
  const idx = lib.indexTaxonomy(require('../data/mzakka-taxonomy.json'));
  const r = lib.resolveCanonicalLeaf(
    fs.readFileSync(path.join(CACHE, 'item-M12500.html'), 'utf8'), idx);
  assert.equal(r.leaf.id, 2816);
  assert.deepEqual(r.path.map((p) => p.id), [1801, 2810, 2816]);
});

test('canonical leaf: cross-listed items keep primary/first real root (1865 & accessory noise dropped)', () => {
  const idx = lib.indexTaxonomy(require('../data/mzakka-taxonomy.json'));
  const dir = CACHE;
  const cases = [
    ['item-S10121.html', 2822], // doll onahole; also appears under wig/1865
    ['item-L6452.html', 2506], // condom; also under 業務用 bulk
    ['item-M8480.html', 2822], // onahole; multiple facet + cross roots
  ];
  for (const [file, expectLeaf] of cases) {
    const r = lib.resolveCanonicalLeaf(fs.readFileSync(path.join(dir, file), 'utf8'), idx);
    assert.equal(r.leaf.id, expectLeaf, `${file} -> ${r.leaf && r.leaf.id}`);
  }
});

test('built JSON: 13 roots, depth<=3, unique ids, no facet names', () => {
  const data = require('../data/mzakka-taxonomy.json');
  assert.equal(data.roots.length, 13);
  assert.ok(data.stats.maxDepth <= 3);
  assert.equal(data.stats.duplicateIds.length, 0);
  assert.equal(data.stats.bannedNameHits.length, 0);
  const ids = new Set();
  function walk(n) {
    assert.ok(!ids.has(n.id), `duplicate id ${n.id}`);
    ids.add(n.id);
    n.children.forEach(walk);
  }
  data.roots.forEach(walk);
});
