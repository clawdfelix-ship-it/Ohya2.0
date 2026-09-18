const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const INFO_VIEWS = [
  'views/info/help.ejs',
  'views/info/shipping.ejs',
  'views/info/payment.ejs',
  'views/info/returns.ejs',
  'views/info/faq.ejs',
  'views/info/wholesale.ejs',
  'views/info/contact.ejs',
  'views/info/terms.ejs',
  'views/info/privacy.ejs',
];

test('all info pages exist and use the shared info shell', () => {
  INFO_VIEWS.forEach((v) => {
    const html = read(v);
    assert.match(html, /include\('\.\.\/partials\/info-top'\)/, `${v} should open with info-top`);
    assert.match(html, /include\('\.\.\/partials\/info-bottom'\)/, `${v} should close with info-bottom`);
  });
});

test('storeInfo holds the real public contact / payment / company data', () => {
  const src = read('utils/storeInfo.js');
  assert.match(src, /9551 4133/, 'WhatsApp display number');
  assert.match(src, /85295514133/, 'wa.me raw number');
  assert.match(src, /f\.chan@hy-toy\.com/, 'contact email');
  assert.match(src, /741-536536-838/, 'HSBC account number');
  assert.match(src, /100384072/, 'FPS ID');
  assert.match(src, /Hao Yang Hong Kong International Co Ltd/, 'bank account name');
  assert.match(src, /香港浩洋商品代理有限公司/, 'Chinese company name');
});

test('shipping page states JP import + HK warehouse + SF freight-collect + 10-14 days', () => {
  const html = read('views/info/shipping.ejs');
  assert.match(html, /日本/, 'mentions Japan origin');
  assert.match(html, /順豐/, 'mentions SF Express');
  assert.match(html, /到付/, 'freight collect');
  assert.match(html, /etaDays/, 'uses centralised ETA');
});

test('returns page mirrors 7-day defective-goods policy and sealed-goods rule', () => {
  const html = read('views/info/returns.ejs');
  assert.match(html, /7 天/, '7-day window');
  assert.match(html, /未拆封|未使用/, 'sealed/unused requirement');
});

test('wholesale page says wholesale is the main business and requires BR', () => {
  const html = read('views/info/wholesale.ejs');
  assert.match(html, /批發分銷為主要業務/, 'wholesale focus');
  assert.match(html, /BR|商業登記/, 'business registration requirement');
});

test('wholesale page states first-deal 50% deposit, balance on arrival in HK, then ship', () => {
  const html = read('views/info/wholesale.ejs');
  assert.match(html, /50% 訂金/, '50% deposit at order');
  assert.match(html, /收取其餘 50% 餘額/, 'balance collected when goods arrive HK warehouse');
  assert.match(html, /再由香港以順豐寄出|再由香港/, 'shipped from HK only after balance paid');
});

test('app.js registers a route for every info page', () => {
  const app = read('app.js');
  ['/help', '/shipping', '/payment', '/returns', '/faq', '/wholesale', '/contact', '/terms', '/privacy'].forEach((r) => {
    assert.ok(app.includes(`route: '${r}'`), `route ${r} registered`);
  });
  assert.match(app, /res\.locals\.store = storeInfo/, 'store info exposed to views');
});

test('footer links point at real info pages instead of /products placeholders', () => {
  const footer = read('views/partials/footer.ejs');
  assert.match(footer, /href="\/faq"/);
  assert.match(footer, /href="\/contact"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="\/shipping"/);
  // 不再有「常見問題/私隱/條款」死 link 指去 /products
  const dead = footer.match(/href="\/products"[^>]*>(?:常見問題|私隱政策|使用條款|聯絡我們|使用指南)/g);
  assert.equal(dead, null);
});
