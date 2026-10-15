const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(relativePath, extras = {}) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const context = {
    window: {},
    document: {},
    console,
    ...extras,
  };
  vm.runInNewContext(source, context, { filename: absolutePath });
  return context.window;
}

test('customizer state store returns cloned snapshots and notifies subscribers', () => {
  const windowObject = loadBrowserScript('public/js/customizer/state.js');
  const store = windowObject.CustomizerState.createCustomizerStore({
    selectedProductType: { id: 1, name: 'Football' },
  });

  let observed = null;
  store.subscribe((state) => {
    observed = state;
  });

  const snapshot = store.getState();
  snapshot.selectedProductType.name = 'Mutated';

  store.setState({
    selectedTemplate: { id: 2, name: 'Home Kit' },
  });

  const nextSnapshot = store.getState();
  assert.equal(nextSnapshot.selectedProductType.name, 'Football');
  assert.equal(nextSnapshot.selectedTemplate.name, 'Home Kit');
  assert.equal(observed.selectedTemplate.name, 'Home Kit');
});

test('customizer catalog indexes templates by product type and resolves defaults', () => {
  const windowObject = loadBrowserScript('public/js/customizer/catalog.js');
  const catalog = windowObject.CustomizerCatalog.normalizeCatalogPayload({
    productTypes: [{ id: 10, name: 'Basketball' }, { id: 20, name: 'Volleyball' }],
    templates: [
      { id: 100, name: 'Fast Break', product_type_id: 10 },
      { id: 101, name: 'Defense', product_type_id: 10 },
      { id: 200, name: 'Ace', product_type_id: 20 },
    ],
  });

  assert.equal(catalog.templatesByProductType['10'].length, 2);
  assert.equal(windowObject.CustomizerCatalog.findDefaultProductType(catalog, null).id, 10);
  assert.equal(windowObject.CustomizerCatalog.findDefaultTemplate(catalog, 10, 101).name, 'Defense');
});

test('customizer catalog filters assets by selection and type', () => {
  const windowObject = loadBrowserScript('public/js/customizer/catalog.js');
  const catalog = windowObject.CustomizerCatalog.normalizeCatalogPayload({
    assets: [
      { id: 1, asset_type: 'logo', product_type_id: 10, template_id: null, name: 'Global Team Mark' },
      { id: 2, asset_type: 'logo', product_type_id: 20, template_id: null, name: 'Other Sport Mark' },
      { id: 3, asset_type: 'palette', product_type_id: 10, template_id: 99, name: 'Home Palette' },
    ],
  });

  const assets = windowObject.CustomizerCatalog.listAssetsForSelection(
    catalog,
    { productTypeId: 10, templateId: 99 },
    ['logo', 'palette']
  );

  assert.equal(assets.length, 2);
  assert.equal(assets[0].id, 1);
  assert.equal(assets[1].id, 3);
});

test('customizer editor module loads successfully', () => {
  const windowObject = loadBrowserScript('public/js/customizer/editor.js', {
    window: {
      CustomizerCatalog: {
        listAssetsForSelection() {
          return [];
        },
      },
    },
    document: {},
  });

  assert.equal(typeof windowObject.CustomizerEditor.createEditorRenderer, 'function');
});

test('customizer app module loads successfully when editor root is absent', () => {
  const windowObject = loadBrowserScript('public/js/customizer/app.js', {
    window: {},
    document: {
      getElementById() {
        return null;
      },
    },
  });

  assert.ok(windowObject);
});

test('customizer compositor paints preview canvas for current side', () => {
  const windowObject = loadBrowserScript('public/js/customizer/compositor.js', {
    window: { devicePixelRatio: 1 },
  });

  const operations = [];
  const gradient = { addColorStop() {} };
  const context2d = {
    save() { operations.push('save'); },
    restore() { operations.push('restore'); },
    setTransform() { operations.push('setTransform'); },
    clearRect() { operations.push('clearRect'); },
    fillRect() { operations.push('fillRect'); },
    beginPath() { operations.push('beginPath'); },
    moveTo() { operations.push('moveTo'); },
    lineTo() { operations.push('lineTo'); },
    closePath() { operations.push('closePath'); },
    fill() { operations.push('fill'); },
    stroke() { operations.push('stroke'); },
    roundRect() { operations.push('roundRect'); },
    arc() { operations.push('arc'); },
    fillText() { operations.push('fillText'); },
    createLinearGradient() { return gradient; },
    textBaseline: 'alphabetic',
    textAlign: 'left',
    font: '',
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
  };

  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext() {
      return context2d;
    },
    getBoundingClientRect() {
      return { width: 640, height: 520 };
    },
  };

  const root = {
    querySelector(selector) {
      return selector === '[data-role="preview-canvas"]' ? canvas : null;
    },
  };

  const compositor = windowObject.CustomizerCompositor.createPreviewCompositor(root);
  compositor.render({
    selectedProductType: { name: 'Football' },
    selectedTemplate: { name: 'Away Kit' },
    previews: { activeSide: 'back' },
    zones: [{ label: 'Back Number' }],
  });

  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 520);
  assert.match(operations.join(','), /fillRect/);
  assert.match(operations.join(','), /fillText/);
});
