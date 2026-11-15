'use strict';

/**
 * GA4 流量層 + Cookie consent 測試（P3-b）
 *
 * 設計重點：
 *  - 私隱紅線優先：未同意 → 絕對唔會出現 gtag.js script
 *  - ID 唔合法／未設定 → 絕對唔會出現 gtag.js script
 *  - 撤回同意 → gtag.js script 必須被移除
 *  - GA4 只收 page_view，絕對唔送 purchase / order_ref / session_id
 *  - 自建埋點嘅 PII 黑名單唔可以因為加 utm 而失效
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ga4Lib = require('../lib/ga4');
const consentMod = require('../public/js/consent-manager');
const ga4Mod = require('../public/js/ga4');
const { validateEvent, sanitizeUtmValue, ALLOWED_CONTEXT_KEYS } = require('../lib/analyticsEvents');

const VALID_ID = 'G-80LXZ1KE2M';

// ---------------------------------------------------------------------------
// 測試用嘅極簡 fake DOM（冇 jsdom 依賴）
// ---------------------------------------------------------------------------
function makeFakeDom(opts) {
  opts = opts || {};
  const scripts = [];
  const attrs = opts.bodyAttrs || {};

  const doc = {
    title: 'OHYA',
    scripts,
    body: {
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
    },
    head: {
      appendChild(el) {
        scripts.push(el);
        el.parentNode = doc.head;
        return el;
      },
      removeChild(el) {
        const i = scripts.indexOf(el);
        if (i !== -1) scripts.splice(i, 1);
        el.parentNode = null;
        return el;
      },
    },
    createElement(tag) {
      return {
        tagName: tag,
        _attrs: {},
        setAttribute(k, v) {
          this._attrs[k] = v;
        },
        getAttribute(k) {
          return this._attrs[k] === undefined ? null : this._attrs[k];
        },
        parentNode: null,
      };
    },    querySelector(selector) {
      if (selector === 'script[data-ohya-ga4]') {
        return scripts.find((s) => s.getAttribute('data-ohya-ga4') === '1') || null;
      }
      return null;
    },
  };

  const win = {
    document: doc,
    location: { pathname: '/product/106703', href: 'https://www.ohyagroups.com/product/106703' },
    dataLayer: [],
    OH_GA4_ID: opts.windowId,
  };

  return { doc, win, scripts };
}

function makeFakeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem(k, v) {
      data[k] = String(v);
    },
    removeItem(k) {
      delete data[k];
    },
    _data: data,
  };
}

// ===========================================================================
// 1) lib/ga4.js — Measurement ID 驗證
// ===========================================================================
test('normalizeMeasurementId 只接受合法 G- ID', () => {
  assert.equal(ga4Lib.normalizeMeasurementId(VALID_ID), VALID_ID);
  assert.equal(ga4Lib.normalizeMeasurementId('  G-80LXZ1KE2M  '), VALID_ID);
});

test('normalizeMeasurementId 拒絕所有唔合法嘅值', () => {
  const bad = [
    undefined,
    null,
    '',
    'ABC123',
    'G-',
    'G-ABC',            // 太短（少過 4 位）
    'G-80LXZ1KE2M EXTRA', // 有空格
    'g-80lxz1ke2m',     // 小寫
    'UA-12345-1',       // UA 格式
    'G-80LXZ1KE2M;drop',
    123,
  ];
  for (const value of bad) {
    assert.equal(ga4Lib.normalizeMeasurementId(value), '', `唔應該接受: ${String(value)}`);
  }
});

test('ga4BodyAttr 只喺合法 ID 時先輸出 attribute', () => {
  assert.equal(ga4Lib.ga4BodyAttr(VALID_ID), ` data-ga4-id="${VALID_ID}"`);
  assert.equal(ga4Lib.ga4BodyAttr(''), '');
  assert.equal(ga4Lib.ga4BodyAttr(undefined), '');
  assert.equal(ga4Lib.ga4BodyAttr('nope'), '');
});

// ===========================================================================
// 2) consent-manager — 預設拒絕 / 接受 / 拒絕 / 撤回 / storage 失效
// ===========================================================================
test('consent 預設係拒絕（未表態）', () => {
  const storage = makeFakeStorage();
  const cm = consentMod.createConsentManager({ storage, target: null });
  assert.equal(cm.getState(), 'unknown');
  assert.equal(cm.isGranted(), false);
  assert.equal(cm.isDecided(), false);
});

test('accept 會寫入 localStorage 並變成 granted', () => {
  const storage = makeFakeStorage();
  const cm = consentMod.createConsentManager({ storage, target: null });
  cm.accept();
  assert.equal(cm.getState(), 'granted');
  assert.equal(cm.isGranted(), true);
  assert.ok(storage.getItem(consentMod.STORAGE_KEY), '同意狀態必須持久化');
});

test('reject 會持久化為 denied，而且唔係 granted', () => {
  const storage = makeFakeStorage();
  const cm = consentMod.createConsentManager({ storage, target: null });
  cm.reject();
  assert.equal(cm.getState(), 'denied');
  assert.equal(cm.isGranted(), false);
  assert.equal(cm.isDecided(), true);
});

test('withdraw 會清走持久化狀態，回到未表態', () => {
  const storage = makeFakeStorage();
  const cm = consentMod.createConsentManager({ storage, target: null });
  cm.accept();
  assert.ok(storage.getItem(consentMod.STORAGE_KEY));
  cm.withdraw();
  assert.equal(cm.getState(), 'unknown');
  assert.equal(storage.getItem(consentMod.STORAGE_KEY), null, '撤回必須清走 localStorage');
});

test('storage 完全失效（private mode）唔會 crash', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const cm = consentMod.createConsentManager({ storage: broken, target: null });
  assert.equal(cm.getState(), 'unknown');
  assert.doesNotThrow(() => cm.accept());
  // 寫唔到 storage → memory state 仍然生效
  assert.equal(cm.isGranted(), true);
});

test('壞咗嘅 storage 內容會當成未表態（唔會誤判為已同意）', () => {
  const storage = makeFakeStorage({ [consentMod.STORAGE_KEY]: 'not-json{{{' });
  const cm = consentMod.createConsentManager({ storage, target: null });
  assert.equal(cm.getState(), 'unknown');
  assert.equal(cm.isGranted(), false);
});

// ===========================================================================
// 3) ga4 loader — consent gating（最關鍵：未同意絕對唔會載入）
// ===========================================================================
test('無合法 ID → 絕對唔會載入 gtag.js', () => {
  const { doc, win, scripts } = makeFakeDom();
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => true },
  });
  assert.equal(loader.load(), false);
  assert.equal(scripts.length, 0, '唔應該插入任何 gtag.js script');
});

test('ID 格式唔合法 → 絕對唔會載入 gtag.js', () => {
  for (const bad of ['ABC123', 'G-', 'g-80lxz1ke2m', 'G-BAD ID']) {
    const { doc, win, scripts } = makeFakeDom();
    const loader = ga4Mod.createLoader({
      window: win,
      document: doc,
      consent: { isGranted: () => true },
      measurementId: bad,
    });
    assert.equal(loader.load(), false, `唔應該載入: ${bad}`);
    assert.equal(scripts.length, 0);
  }
});

test('有合法 ID 但未同意 → 絕對唔會載入 gtag.js', () => {
  const { doc, win, scripts } = makeFakeDom({ windowId: VALID_ID });
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => false },
  });
  assert.equal(loader.load(), false);
  assert.equal(scripts.length, 0, '未同意就唔可以出現 gtag.js');
  assert.equal(loader.isLoaded(), false);
});

test('已同意 + 合法 ID → 載入 gtag.js 一次', () => {
  const { doc, win, scripts } = makeFakeDom({ windowId: VALID_ID });
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => true },
  });
  assert.equal(loader.load(), true);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${VALID_ID}`);
  assert.equal(scripts[0].getAttribute('data-ohya-ga4'), '1');
  // 再 load 唔會插入第二個 script
  assert.equal(loader.load(), true);
  assert.equal(scripts.length, 1);
});

test('撤回同意 → gtag.js script 被移除，而且 GA 官方 disable 開關被設定', () => {
  const { doc, win, scripts } = makeFakeDom({ windowId: VALID_ID });
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => true },
  });
  assert.equal(loader.load(), true);
  assert.equal(scripts.length, 1);

  loader.disable();
  assert.equal(win[`ga-disable-${VALID_ID}`], true, '必須設定 GA 官方 disable 開關');
  assert.equal(loader.isLoaded(), false);
  assert.equal(loader.hasGa4Script(), false, '撤回之後唔應該再有 gtag.js script');
});

test('撤回之後再接受 → 可以重新載入，而且唔會重複計 page_view', () => {
  const { doc, win, scripts } = makeFakeDom({ windowId: VALID_ID });
  let granted = true;
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => granted },
  });
  loader.load();
  const pageViewsAfterFirst = win.dataLayer.filter((a) => a[0] === 'event' && a[1] === 'page_view').length;

  loader.disable();
  granted = true;
  loader.enable();
  loader.load();

  const pageViewsAfterSecond = win.dataLayer.filter((a) => a[0] === 'event' && a[1] === 'page_view').length;
  assert.equal(pageViewsAfterFirst, 1);
  assert.equal(pageViewsAfterSecond, 1, '撤回再接受唔應該重複計 page_view');
});

test('GA4 只送 page_view：絕對唔送 purchase / order_ref / session_id', () => {
  const { doc, win } = makeFakeDom({ windowId: VALID_ID });
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => true },
  });
  loader.load();

  const events = win.dataLayer.filter((a) => a[0] === 'event').map((a) => a[1]);
  assert.deepEqual(events, ['page_view'], '只應該有 page_view 一個事件');

  // 掃描全部 dataLayer 內容：唔准出現交易相關 key
  const flat = JSON.stringify(win.dataLayer.map((a) => Array.prototype.slice.call(a)));
  for (const forbidden of ['purchase', 'order_ref', 'order_id', 'session_id', 'user_id', 'email', 'transaction_id']) {
    assert.ok(!flat.includes(forbidden), `GA4 payload 唔准包含 ${forbidden}`);
  }
});

test('GA4 config 私隱收緊：關掉 Google signals 同廣告個人化', () => {
  const { doc, win } = makeFakeDom({ windowId: VALID_ID });
  const loader = ga4Mod.createLoader({
    window: win,
    document: doc,
    consent: { isGranted: () => true },
  });
  loader.load();

  const configCall = win.dataLayer.find((a) => a[0] === 'config');
  assert.ok(configCall, '必須有 config 呼叫');
  const cfg = configCall[2];
  assert.equal(cfg.allow_google_signals, false);
  assert.equal(cfg.allow_ad_personalization_signals, false);
  assert.equal(cfg.send_page_view, false, 'page_view 由我哋自己控制');

  const consentDefault = win.dataLayer.find((a) => a[0] === 'consent' && a[1] === 'default');
  assert.ok(consentDefault, '必須先發 consent default');
  assert.equal(consentDefault[2].analytics_storage, 'denied');
  assert.equal(consentDefault[2].ad_storage, 'denied');
  assert.equal(consentDefault[2].ad_personalization, 'denied');
});

// ===========================================================================
// 4) 渲染層 — HTML 輸出
// ===========================================================================
test('ga4-init partial：無 ID 唔會輸出任何 script；有合法 ID 先會輸出', () => {
  const tpl = path.join(root, 'views/partials/ga4-init.ejs');
  const without = ejs.render(fs.readFileSync(tpl, 'utf8'), {});
  assert.ok(!without.includes('OH_GA4_ID'), '無 ID 唔應該出現 OH_GA4_ID');
  assert.ok(!without.includes('googletagmanager'), '無 ID 唔應該出現 gtag script');

  const withId = ejs.render(fs.readFileSync(tpl, 'utf8'), { ga4MeasurementId: VALID_ID });
  assert.ok(withId.includes(`window.OH_GA4_ID = "${VALID_ID}"`));
});

test('ga4-init partial：ID 格式唔合法就唔會輸出', () => {
  const tpl = path.join(root, 'views/partials/ga4-init.ejs');
  const src = fs.readFileSync(tpl, 'utf8');
  for (const bad of ['ABC123', 'G-', 'g-abc', 'UA-1234-1']) {
    const out = ejs.render(src, { ga4MeasurementId: bad });
    assert.ok(!out.includes('OH_GA4_ID'), `唔應該輸出: ${bad}`);
  }
});

test('cookie-consent partial 有接受／拒絕按鈕同隱藏預設', () => {
  const tpl = path.join(root, 'views/partials/cookie-consent.ejs');
  const html = ejs.render(fs.readFileSync(tpl, 'utf8'), {});
  assert.ok(html.includes('data-consent-banner'));
  assert.ok(html.includes('data-consent-accept'));
  assert.ok(html.includes('data-consent-reject'));
  assert.ok(/data-consent-banner[^>]*\bhidden\b/.test(html), 'banner 預設必須係 hidden');
});

test('header partial 載入 consent-manager 同 ga4 loader（順序正確）', () => {
  const header = read('views/partials/header.ejs');
  const consentAt = header.indexOf('/js/consent-manager.js');
  const ga4At = header.indexOf('/js/ga4.js');
  assert.ok(consentAt !== -1, 'header 必須載入 consent-manager.js');
  assert.ok(ga4At !== -1, 'header 必須載入 ga4.js');
  assert.ok(consentAt < ga4At, 'consent-manager 一定要喺 ga4.js 之前（ga4 靠佢決定載唔載入）');
  assert.ok(header.includes("include('ga4-init')"), 'header 必須注入 ga4-init');
});

test('footer 有「Cookie 設定」同「撤回分析同意」入口，同埋 banner', () => {
  const footer = read('views/partials/footer.ejs');
  assert.ok(footer.includes('data-consent-settings'), 'footer 必須有 Cookie 設定入口');
  assert.ok(footer.includes('data-consent-withdraw'), 'footer 必須有撤回入口');
  assert.ok(footer.includes("include('cookie-consent')"), 'footer 必須包含 banner');
});

test('app.js 由 env 注入 ga4MeasurementId，並且經過 lib/ga4 驗證', () => {
  const app = read('app.js');
  assert.ok(app.includes("require('./lib/ga4')"), 'app.js 必須 import lib/ga4');
  assert.ok(/res\.locals\.ga4MeasurementId\s*=\s*normalizeMeasurementId\(process\.env\.GA_MEASUREMENT_ID\)/.test(app),
    'ga4MeasurementId 必須經過 normalizeMeasurementId 驗證先可以出現在頁面');
});

test('私隱政策已披露兩套統計系統同撤回方法', () => {
  const privacy = read('views/info/privacy.ejs');
  assert.ok(privacy.includes('Google Analytics'), '必須提到 GA4');
  assert.ok(privacy.includes('自建統計'), '必須提到自建統計');
  assert.ok(privacy.includes('撤回分析同意'), '必須說明可以撤回');
  assert.ok(privacy.includes('180 日'), '必須講明自建事件保留期');
  assert.ok(/唔會記錄你買過咩/.test(privacy), '必須講明 GA4 唔記交易');
});

test('.env.example 有 GA_MEASUREMENT_ID 說明', () => {
  const env = read('.env.example');
  assert.ok(env.includes('GA_MEASUREMENT_ID='), '.env.example 必須有 GA_MEASUREMENT_ID');
});

// ===========================================================================
// 5) utm 捕捉 + 消毒（PII 黑名單唔可以失效）
// ===========================================================================
test('utm 消毒只留有限字元，上限 64', () => {
  assert.equal(sanitizeUtmValue('google'), 'google');
  assert.equal(sanitizeUtmValue('a-b_c.d'), 'a-b_c.d');
  assert.equal(sanitizeUtmValue('bad value!'), 'badvalue');
  assert.equal(sanitizeUtmValue('中文'), null, '清走所有字元 → null（唔記）');
  assert.equal(sanitizeUtmValue(''), null);
  assert.equal(sanitizeUtmValue(undefined), null);
  assert.equal(sanitizeUtmValue(null), null);
  assert.equal(sanitizeUtmValue('x'.repeat(200)).length, 64);
});

test('utm 係白名單內嘅 context key', () => {
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    assert.ok(ALLOWED_CONTEXT_KEYS.includes(k), `${k} 必須喺白名單`);
  }
});

test('validateEvent 會保存消毒後嘅 utm', () => {
  const res = validateEvent({
    event: 'view',
    step: 'product_view',
    context: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'summer sale!' },
  });
  assert.equal(res.ok, true);
  assert.equal(res.event.context.utm_source, 'google');
  assert.equal(res.event.context.utm_medium, 'cpc');
  assert.equal(res.event.context.utm_campaign, 'summersale');
});

test('utm 唔會帶入數值／boolean（只准字串）', () => {
  const res = validateEvent({ event: 'view', context: { utm_source: 123, utm_medium: true } });
  assert.equal(res.ok, true);
  assert.equal(res.event.context.utm_source, undefined);
  assert.equal(res.event.context.utm_medium, undefined);
});

test('空 utm 唔會入 context', () => {
  const res = validateEvent({ event: 'view', context: { utm_source: '', utm_medium: '   ' } });
  assert.equal(res.ok, true);
  assert.equal(res.event.context.utm_source, undefined);
  assert.equal(res.event.context.utm_medium, undefined);
});

test('加咗 utm 之後，PII 黑名單仍然生效（email/ip 照樣被丟棄）', () => {
  const res = validateEvent({
    event: 'view',
    context: {
      utm_source: 'google',
      billing_email: 'x@y.z',
      client_ip: '1.2.3.4',
      email: 'a@b.c',
      ip: '5.6.7.8',
      user_agent: 'UA-xyz',
      quantity: 2,
    },
  });
  assert.equal(res.ok, true);
  const ctx = res.event.context;
  assert.equal(ctx.utm_source, 'google', 'utm 應該正常保留');
  assert.equal(ctx.quantity, 2);
  assert.equal(ctx.billing_email, undefined);
  assert.equal(ctx.client_ip, undefined);
  assert.equal(ctx.email, undefined);
  assert.equal(ctx.ip, undefined);
  assert.equal(ctx.user_agent, undefined);

  const flat = JSON.stringify(ctx);
  assert.ok(!flat.includes('@'));
  assert.ok(!flat.includes('1.2.3.4'));
});

test('前端 storefront-analytics 有 utm 捕捉同消毒', () => {
  const js = read('public/js/storefront-analytics.js');
  assert.ok(js.includes('utm_source'), '前端必須支援 utm_source');
  assert.ok(js.includes('utmParams'), '前端必須有 utm 讀取邏輯');
  assert.ok(js.includes('sessionStorage'), 'utm 必須用 sessionStorage 跨頁沿用');
  assert.ok(/UTM_VALUE_RE/.test(js), '前端必須有 utm 消毒規則');
});

test('前端唔會因為加 utm 而放寬私隱（只准白名單 context key）', () => {
  const js = read('public/js/storefront-analytics.js');
  const block = js.slice(js.indexOf('var CONTEXT_KEYS'), js.indexOf('var UTM_KEYS'));
  assert.ok(block.includes('utm_source'));
  // CONTEXT_KEYS 內唔准出現 email / ip / user_agent 等等
  for (const forbidden of ['email', 'ip', 'user_agent', 'address', 'phone']) {
    assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(block), `CONTEXT_KEYS 唔准包含 ${forbidden}`);
  }
});
