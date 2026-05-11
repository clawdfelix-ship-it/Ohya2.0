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

test('index uses black-body + white framed wrapper markers', () => {
  const html = readView('index.ejs');
  assert.match(html, /class="[^"]*\bmz-body\b[^"]*"/, 'index.ejs should include mz-body on <body>');
  assert.match(html, /id="mz-wrapper"/, 'index.ejs should include #mz-wrapper');
  assert.match(html, /\bmz-3col\b/, 'index.ejs should use mz-3col for stable 3-column layout');
});

test('all key pages include left+right sidebar partials', () => {
  const pages = ['index.ejs', 'products.ejs', 'product.ejs', 'cart.ejs', 'login.ejs', 'register.ejs'];
  for (const p of pages) {
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

test('header uses mzakka theme markers (mz-topbar / mz-header / mz-nav)', () => {
  const header = readView(path.join('partials', 'header.ejs'));
  assert.match(header, /\bmz-topbar\b/, 'header should include mz-topbar');
  assert.match(header, /\bmz-header\b/, 'header should include mz-header');
  assert.match(header, /\bmz-nav\b/, 'header should include mz-nav');
});

test('footer uses mzakka theme classes on bars', () => {
  const footer = readView(path.join('partials', 'footer.ejs'));
  assert.match(footer, /id="mz-footer-links"[^>]*\bmz-footer-links\b/, 'footer links bar should include mz-footer-links');
  assert.match(footer, /id="mz-footer-18"[^>]*\bmz-footer-18\b/, 'footer 18 bar should include mz-footer-18');
  assert.match(footer, /\/assets\/mzakka\/ui\/logo_18\.gif/, 'footer should include local 18+ logo asset');
});
