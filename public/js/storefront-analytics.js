/*!
 * Ohya storefront analytics（P3-a）— 自建，冇第三方 tracker。
 *
 * 私隱：
 *  - 只送 event / product_id / step / page_type / category / referrer_type / session_id / 非識別 context
 *  - 唔收 email、電話、地址、user id、IP、UA 指紋、cookie
 *  - session_id = sessionStorage 內每個 tab 隨機產生嘅 id（唔關聯帳戶）
 *
 * 行為：
 *  - fail-open：任何錯誤都唔會 throw、唔會阻頁面載入、唔會影響落單
 *  - 傳輸優先 navigator.sendBeacon，fallback fetch(keepalive)
 */
(function () {
  'use strict';

  if (window.OHAnalytics && window.OHAnalytics.__ready) return;

  var ENDPOINT = '/api/analytics/event';
  var SESSION_KEY = 'ohya_sid';
  var SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  var EVENTS = {
    view: 1,
    search: 1,
    add_to_cart: 1,
    checkout_start: 1,
    payment_proof: 1,
    paid: 1
  };
  var STEPS = {
    product_view: 1,
    listing_view: 1,
    search_results: 1,
    guide_view: 1,
    guide_cta_click: 1,
    add_to_cart: 1,
    checkout_click: 1,
    order_created: 1,
    proof_uploaded: 1,
    payment_confirmed: 1
  };
  var PAGE_TYPES = { product: 1, listing: 1, guide: 1, cart: 1, order: 1, other: 1 };
  var REFERRER_TYPES = { direct: 1, google: 1, search: 1, social: 1, internal: 1, other: 1 };
  var CONTEXT_KEYS = {
    result_count: 1,
    item_count: 1,
    quantity: 1,
    page_number: 1,
    position: 1,
    list_name: 1,
    query_len: 1
  };

  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
          out += ('0' + bytes[i].toString(16)).slice(-2);
        }
        return out;
      }
    } catch (e) {}
    return String(Date.now()) + '-' + String(Math.random()).slice(2, 12);
  }

  function sessionId() {
    try {
      var sid = window.sessionStorage.getItem(SESSION_KEY);
      if (!sid || !SESSION_ID_RE.test(sid)) {
        sid = randomId();
        window.sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch (e) {
      // sessionStorage 被封（private mode）→ 用臨時 id，功能照樣但唔跨頁
      return randomId();
    }
  }

  function classifyReferrer() {
    var ref = '';
    try {
      ref = document.referrer || '';
    } catch (e) {
      ref = '';
    }
    if (!ref) return 'direct';
    var host = '';
    try {
      host = new URL(ref, window.location.href).hostname || '';
    } catch (e) {
      try {
        host = ref.split('/')[2] || '';
      } catch (e2) {
        host = '';
      }
    }
    host = host.toLowerCase();
    if (!host) return 'direct';
    if (host === window.location.hostname) return 'internal';
    if (host.indexOf('google.') === 0 || host.indexOf('www.google.') === 0) return 'google';
    if (
      /(^|\.)(bing|yahoo|duckduckgo|baidu|yandex|naver|ecosia|brave)\./.test(host) ||
      /search\./.test(host)
    ) {
      return 'search';
    }
    if (
      /(^|\.)(facebook|instagram|twitter|x|tiktok|threads|linkedin|youtube|reddit|pinterest|whatsapp|line)\./.test(host) ||
      /(^|\.)(facebook|instagram|twitter|tiktok)\.com$/.test(host)
    ) {
      return 'social';
    }
    return 'other';
  }

  function sanitizeContext(ctx) {
    var out = {};
    if (!ctx || typeof ctx !== 'object') return out;
    for (var key in ctx) {
      if (!Object.prototype.hasOwnProperty.call(ctx, key)) continue;
      if (!CONTEXT_KEYS[key]) continue;
      var v = ctx[key];
      if (typeof v === 'number' && isFinite(v)) out[key] = v;
      else if (typeof v === 'boolean') out[key] = v;
      else if (typeof v === 'string') out[key] = v.slice(0, 64);
    }
    return out;
  }

  function buildPayload(event, props) {
    props = props || {};
    var payload = {
      event: event,
      product_id: null,
      step: props.step && STEPS[props.step] ? props.step : null,
      page_type: props.page_type && PAGE_TYPES[props.page_type] ? props.page_type : null,
      category: null,
      referrer_type: props.referrer_type && REFERRER_TYPES[props.referrer_type] ? props.referrer_type : classifyReferrer(),
      session_id: sessionId(),
      context: sanitizeContext(props.context)
    };

    if (props.product_id != null && props.product_id !== '') {
      var pid = parseInt(props.product_id, 10);
      if (isFinite(pid) && pid > 0) payload.product_id = pid;
    }
    if (props.category != null && props.category !== '') {
      var cat = String(props.category).slice(0, 64);
      if (/^[A-Za-z0-9_\-]+$/.test(cat) || /[\u3400-\u9FFF]/.test(cat)) payload.category = cat;
    }
    return payload;
  }

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch (e) {
      // fall through to fetch
    }
    try {
      if (window.fetch) {
        window.fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
          credentials: 'same-origin',
          mode: 'same-origin'
        }).catch(function () {});
      }
    } catch (e) {
      // fail-open：完全唔理
    }
  }

  function track(event, props) {
    try {
      if (!EVENTS[event]) return false;
      send(buildPayload(event, props));
      return true;
    } catch (e) {
      return false;
    }
  }

  function readData(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    var v = el.getAttribute(name);
    return v == null || v === '' ? null : v;
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  window.OHAnalytics = {
    __ready: true,
    track: track,
    sessionId: sessionId,
    referrerType: classifyReferrer,
    // 落單時連同 session_id 一併送往 server（只係非識別 metadata）
    orderMetadata: function () {
      return { session_id: sessionId(), referrer_type: classifyReferrer() };
    }
  };

  onReady(function () {
    try {
      var page = document.body;
      var pageType = readData(page, 'data-analytics-page');
      var productId = readData(page, 'data-analytics-product-id');
      var category = readData(page, 'data-analytics-category');

      if (pageType === 'product' && productId) {
        track('view', {
          step: 'product_view',
          page_type: 'product',
          product_id: productId,
          category: category
        });
      } else if (pageType === 'guide') {
        track('view', { step: 'guide_view', page_type: 'guide' });
      } else if (pageType === 'listing') {
        track('view', { step: 'listing_view', page_type: 'listing' });
      }

      // 搜尋結果頁（URL 有 q）→ search 事件（context 只放非識別嘅結果數）
      try {
        var params = new URLSearchParams(window.location.search || '');
        var q = params.get('q');
        if (q != null && q !== '') {
          var count = readData(document.body, 'data-analytics-result-count');
          track('search', {
            step: 'search_results',
            page_type: 'listing',
            context: {
              result_count: count ? parseInt(count, 10) : undefined,
              query_len: q.length
            }
          });
        }
      } catch (e) {}

      // 指南內商品 CTA：data-analytics-guide-cta="<product_id>"
      document.addEventListener(
        'click',
        function (ev) {
          try {
            var target = ev.target && ev.target.closest ? ev.target.closest('[data-analytics-guide-cta]') : null;
            if (!target) return;
            track('view', {
              step: 'guide_cta_click',
              page_type: 'guide',
              product_id: target.getAttribute('data-analytics-guide-cta')
            });
          } catch (e) {}
        },
        { passive: true }
      );
    } catch (e) {
      // fail-open
    }
  });
})();
