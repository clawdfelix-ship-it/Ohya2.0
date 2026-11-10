const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', 'views', relPath), 'utf8');
}

test('head partial loads mzakka theme css', () => {
  const head = readView(path.join('partials', 'head.ejs'));
  assert.match(head, /mzakka-theme\.css/, 'head.ejs should load mzakka-theme.css');
});

test('index uses the dark body and responsive left-sidebar layout', () => {
  const html = readView('index.ejs');
  assert.match(html, /class="[^"]*\bmz-body\b[^"]*"/, 'index.ejs should include mz-body on <body>');
  assert.match(html, /id="mz-wrapper"/, 'index.ejs should include #mz-wrapper');
  assert.match(html, /lg:grid-cols-\[16rem_minmax\(0,1fr\)\]/, 'index.ejs should use the responsive left-sidebar grid');
  assert.match(html, /id="wrap_center"/, 'index.ejs should retain the main content landmark');
});

test('key pages retain their intended sidebar and main-content layouts', () => {
  for (const p of ['index.ejs', 'products.ejs', 'product.ejs']) {
    const html = readView(p);
    assert.match(html, /include\('partials\/sidebar-left'\)/, `${p} should include sidebar-left`);
    assert.match(html, /id="wrap_center"/, `${p} should retain its main content area`);
    assert.match(html, /lg:grid-cols-\[16rem_minmax\(0,1fr\)\]/, `${p} should use the responsive left-sidebar grid`);
  }
  for (const p of ['cart.ejs', 'login.ejs', 'register.ejs']) {
    const html = readView(p);
    assert.match(html, /include\('partials\/sidebar-left'\)/, `${p} should include sidebar-left`);
    assert.match(html, /include\('partials\/sidebar-right'\)/, `${p} should include sidebar-right`);
  }
});

test('all key pages load mzakka theme css', () => {
  const pages = ['index.ejs', 'products.ejs', 'product.ejs', 'cart.ejs', 'login.ejs', 'register.ejs'];
  for (const p of pages) {
    const html = readView(p);
    assert.match(html, /mzakka-theme\.css/, `${p} should load mzakka-theme.css`);
  }
});

test('footer renders flat link bar + age 18 bar markers', () => {
  const footer = readView(path.join('partials', 'footer.ejs'));
  assert.match(footer, /id="mz-footer-links"/, 'footer should include #mz-footer-links');
  assert.match(footer, /id="mz-footer-18"/, 'footer should include #mz-footer-18');
});

test('header retains its themed shell and accessible mobile category navigation', () => {
  const header = readView(path.join('partials', 'header.ejs'));
  assert.match(header, /\bmz-header\b/, 'header should include mz-header');
  assert.match(header, /data-mobile-menu-open/, 'header should expose mobile category navigation');
  assert.match(header, /aria-controls="mz-mobile-menu-panel"/, 'mobile navigation trigger should identify its panel');
  assert.match(header, /aria-label="商品分類選單"/, 'mobile category panel should have an accessible name');
});

test('footer uses mzakka theme classes on bars', () => {
  const footer = readView(path.join('partials', 'footer.ejs'));
  assert.match(footer, /id="mz-footer-links"[^>]*\bmz-footer-links\b/, 'footer links bar should include mz-footer-links');
  assert.match(footer, /id="mz-footer-18"[^>]*\bmz-footer-18\b/, 'footer 18 bar should include mz-footer-18');
  assert.match(footer, /\/assets\/mzakka\/ui\/logo_18\.gif/, 'footer should include local 18+ logo asset');
});
