'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('listing query exposes real storefront category ancestry without per-card requests', () => {
  const app = read('app.js');
  assert.match(app, /product_storefront[\s\S]*storefront_category_id/, 'listing must use the existing storefront mapping');
  assert.match(app, /storefront_ancestry[\s\S]*parent_id/, 'listing must read category ancestry');
  assert.match(app, /storefront_categories/, 'listing query must return the actual category rows');
});

test('sample listing demonstrates multiple real category links without changing sample commerce data', () => {
  const app = read('app.js');
  assert.match(app, /categoryTags:\s*\[/);
  assert.match(app, /slug:\s*['"]男士護理['"]/);
  assert.match(app, /slug:\s*['"]進階系列['"]/);
  assert.match(app, /categoryTags\.some\(\(tag\) => tag\.slug === selectedCategorySlug\)/, 'sample category links must resolve through the same multi-category data');
  assert.match(app, /products = products\.filter\(p => p\.category === selectedCategory/, 'sample filtering must not alter production price, stock or transaction data');
});

test('sample category links resolve a matching label for a product with multiple tags', () => {
  const app = read('app.js');
  const sampleRoute = app.slice(app.indexOf("app.get('/products'"), app.indexOf('const page = Math.max'));
  assert.match(sampleRoute, /categoryTags[\s\S]*find\(tag => tag\.slug === selectedCategorySlug\)\?\.name/,
    'a secondary sample tag must supply the selected category heading, not fall back to all products');
});

test('mapper preserves validated category labels and slugs only', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');
  const product = mapDbProductToStorefrontProduct({
    id: 42,
    name: '測試商品',
    price_cents: 100,
    storefront_categories: [
      { name: '飛機杯', slug: 'storefront-onahole' },
      { name: '電動飛機杯', slug: 'sf-onahole-electric' },
      { name: '', slug: 'ignored-missing-name' },
      { name: '缺少網址', slug: '' },
      null,
    ],
  }, { toProxyUrl: (value) => value });

  assert.deepEqual(product.categoryTags, [
    { name: '飛機杯', slug: 'storefront-onahole' },
    { name: '電動飛機杯', slug: 'sf-onahole-electric' },
  ]);
});

test('mapper accepts JSON category rows from PostgreSQL and degrades safely', () => {
  const { mapDbProductToStorefrontProduct } = require('../utils/storefrontDbMapper');
  const product = mapDbProductToStorefrontProduct({
    id: 42,
    price_cents: 100,
    storefront_categories: '[{"name":"潤滑劑","slug":"storefront-lotion"}]',
  }, { toProxyUrl: (value) => value });
  assert.deepEqual(product.categoryTags, [{ name: '潤滑劑', slug: 'storefront-lotion' }]);

  const empty = mapDbProductToStorefrontProduct({ id: 1, price_cents: 0 }, { toProxyUrl: (value) => value });
  assert.deepEqual(empty.categoryTags, []);
});

test('only multi-category cards get a stacked disclosure; essential card content stays outside it', () => {
  const view = read('views/products.ejs');
  assert.match(view, /categoryTags\.length\s*>\s*1/);
  assert.match(view, /data-category-stack/);
  assert.match(view, /data-category-stack-trigger/);
  assert.match(view, /aria-expanded="false"/);
  assert.match(view, /aria-controls="product-categories-<%= product\.id %>"/);
  assert.match(view, /id="product-categories-<%= product\.id %>"/);
  assert.match(view, /data-category-stack-links/);
  assert.match(view, /href="\/products\?category=<%= encodeURIComponent\(tag\.slug\) %>&page=1"/);
  assert.match(view, /single category/);
  assert.match(view, /<link rel="stylesheet" href="\/css\/product-category-stack\.css">/);
  assert.match(view, /<script src="\/js\/product-category-stack\.js" defer><\/script>/);

  const trigger = view.indexOf('data-category-stack-trigger');
  const name = view.indexOf('<h3');
  const price = view.indexOf('formatPrice(product.price)');
  const cart = view.indexOf('data-add-to-cart');
  assert.ok(trigger > 0 && trigger < name && name < price && price < cart, 'categories stay above visible name, price and cart CTA');
});

test('touch card focus handling does not swallow disclosure or category link activation', () => {
  const touchUi = read('public/js/touch-ui.js');
  assert.match(touchUi, /closest\('\[data-category-stack\]'\)/);
  const captureStart = touchUi.indexOf("group.addEventListener('click'");
  const captureEnd = touchUi.indexOf('}, true);', captureStart);
  const captureHandler = touchUi.slice(captureStart, captureEnd);
  assert.match(captureHandler, /if \(ev\.target\.closest\('\[data-category-stack\]'\)\) return;/);
  assert.equal((touchUi.match(/data-category-stack/g) || []).length, 1, 'only this disclosure is exempt; existing card behavior remains unchanged');
});

test('stack styles support compact cards, narrow screens and no-motion preferences', () => {
  const css = read('public/css/product-category-stack.css');
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /data-density="compact"/);
  assert.match(css, /is-expanded/);
  assert.doesNotMatch(css, /animation-iteration-count:\s*infinite/);
});

// Tiny DOM double: exercises the real event controller without introducing a runtime dependency.
class ClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}

class Element extends EventEmitter {
  constructor({ dataset = {}, attributes = {}, id = '', hidden = false } = {}) {
    super();
    this.addEventListener = this.on.bind(this);
    this.dataset = dataset;
    this.attributes = { ...attributes };
    this.id = id;
    this.hidden = hidden;
    this.classList = new ClassList(this);
    this.parentElement = null;
  }
  getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) {
    if (selector === '[data-category-stack-trigger]') return this.trigger || null;
    if (selector === '[data-category-stack-links]') return this.panel || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-category-stack-link]') return this.links || [];
    return [];
  }
  closest(selector) {
    const matches = selector === '[data-category-stack]'
      ? this.dataset.categoryStack !== undefined
      : selector === '[data-category-stack-trigger]' && this.attributes['aria-controls'];
    if (matches) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
  contains(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  focus() {
    if (documentDouble.activeElement === this) return;
    documentDouble.activeElement = this;
    this.emit('focusin', new Event('focusin'));
  }
}

function makeDocument() {
  const document = new EventEmitter();
  document.addEventListener = document.on.bind(document);
  document.hidden = false;
  document.activeElement = null;
  document.readyState = 'complete';
  document.stacks = [];
  document.querySelectorAll = (selector) => selector === '[data-category-stack]' ? document.stacks : [];
  document.getElementById = (id) => document.stacks.map((stack) => stack.panel).find((panel) => panel.id === id) || null;
  return document;
}

let documentDouble;

function makeStack(id, labels = ['第一分類', '第二分類', '第三分類']) {
  const stack = new Element({ dataset: { categoryStack: '' } });
  stack.trigger = new Element({ attributes: { 'aria-controls': `categories-${id}`, 'aria-expanded': 'false' } });
  stack.panel = new Element({ id: `categories-${id}`, hidden: true });
  stack.links = labels.map(() => new Element({ dataset: { categoryStackLink: '' } }));
  stack.trigger.parentElement = stack;
  stack.panel.parentElement = stack;
  stack.links.forEach((link) => { link.parentElement = stack; });
  stack.trigger.stack = stack;
  stack.links.forEach((link) => { link.stack = stack; });
  return stack;
}

function loadController(document, matchMedia = () => ({ matches: false })) {
  const modulePath = path.join(root, 'public/js/product-category-stack.js');
  delete require.cache[require.resolve(modulePath)];
  global.document = document;
  global.window = { matchMedia };
  require(modulePath);
  return () => {
    delete global.document;
    delete global.window;
    delete require.cache[require.resolve(modulePath)];
  };
}

function key(target, value) {
  return {
    key: value,
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

test('controller toggles from button clicks and synchronizes ARIA and hidden state', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(stack.panel.hidden, false);
    assert.equal(stack.classList.contains('is-expanded'), true);
    documentDouble.emit('click', click);
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(stack.panel.hidden, true);
  } finally { cleanup(); }
});

test('touch-style focus then click keeps the disclosure pinned until the second tap', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    documentDouble.activeElement = stack.trigger;
    stack.emit('focusin', new Event('focusin'));
    assert.equal(stack.panel.hidden, false);
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    assert.equal(stack.panel.hidden, false, 'focus followed by tap must not immediately collapse');
    stack.emit('focusout', { relatedTarget: null });
    assert.equal(stack.panel.hidden, false, 'losing focus does not dismiss a touch-pinned panel');
    documentDouble.emit('click', click);
    assert.equal(stack.panel.hidden, true, 'second tap explicitly closes the pinned disclosure');
  } finally { cleanup(); }
});

test('touch pointer tap can close the focused trigger without focus reopening it', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    stack.emit('pointerenter', { pointerType: 'touch' });
    documentDouble.activeElement = stack.trigger;
    stack.emit('focusin', new Event('focusin'));
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    assert.equal(stack.panel.hidden, false);
    stack.emit('pointerleave', { pointerType: 'touch' });
    assert.equal(stack.panel.hidden, false, 'touch release outside trigger stays pinned');
    documentDouble.emit('click', click);
    assert.equal(stack.panel.hidden, true, 'second touch tap closes and must stay closed');
  } finally { cleanup(); }
});

test('controller opens on hover only for fine pointers and closes on pointer leave', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble, () => ({ matches: true }));
  try {
    stack.emit('pointerenter', new Event('pointerenter'));
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'true');
    stack.emit('pointerleave', new Event('pointerleave'));
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
  } finally { cleanup(); }
});

test('controller does not depend on hover for touch pointers', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble, () => ({ matches: false }));
  try {
    stack.emit('pointerenter', new Event('pointerenter'));
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
  } finally { cleanup(); }
});

test('controller supports Enter, Space, arrow navigation, Home and End', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    documentDouble.activeElement = stack.trigger;
    documentDouble.emit('keydown', key(stack.trigger, 'Enter'));
    assert.equal(stack.panel.hidden, false);
    documentDouble.emit('keydown', key(stack.trigger, ' '));
    assert.equal(stack.panel.hidden, true);

    documentDouble.activeElement = stack.links[0];
    const down = key(stack.links[0], 'ArrowDown');
    documentDouble.emit('keydown', down);
    assert.equal(documentDouble.activeElement, stack.links[1]);
    assert.equal(down.defaultPrevented, true);
    documentDouble.emit('keydown', key(stack.links[1], 'ArrowUp'));
    assert.equal(documentDouble.activeElement, stack.links[0]);
    documentDouble.emit('keydown', key(stack.links[0], 'End'));
    assert.equal(documentDouble.activeElement, stack.links[2]);
    documentDouble.emit('keydown', key(stack.links[2], 'Home'));
    assert.equal(documentDouble.activeElement, stack.links[0]);
  } finally { cleanup(); }
});

test('Escape collapses and restores trigger focus; outside clicks collapse', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    documentDouble.activeElement = stack.links[1];
    const escape = key(stack.links[1], 'Escape');
    documentDouble.emit('keydown', escape);
    assert.equal(stack.panel.hidden, true);
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(documentDouble.activeElement, stack.trigger);
    assert.equal(escape.defaultPrevented, true);

    documentDouble.emit('click', click);
    const outside = new Event('click');
    Object.defineProperty(outside, 'target', { value: new Element() });
    documentDouble.emit('click', outside);
    assert.equal(stack.panel.hidden, true);
  } finally { cleanup(); }
});

test('Escape from a category link restores trigger focus without reopening the panel', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    documentDouble.activeElement = stack.links[0];
    const escape = key(stack.links[0], 'Escape');
    documentDouble.emit('keydown', escape);
    stack.trigger.emit('focusin', new Event('focusin'));
    assert.equal(stack.panel.hidden, true);
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(documentDouble.activeElement, stack.trigger);
  } finally { cleanup(); }
});

test('hidden pages immediately collapse without timers or continuous animation', () => {
  documentDouble = makeDocument();
  const stack = makeStack(1);
  documentDouble.stacks = [stack];
  const cleanup = loadController(documentDouble);
  try {
    const click = new Event('click');
    Object.defineProperty(click, 'target', { value: stack.trigger });
    documentDouble.emit('click', click);
    documentDouble.hidden = true;
    documentDouble.emit('visibilitychange', new Event('visibilitychange'));
    assert.equal(stack.panel.hidden, true);
    assert.equal(stack.trigger.getAttribute('aria-expanded'), 'false');
  } finally { cleanup(); }
});
