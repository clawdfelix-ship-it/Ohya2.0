/*!
 * Ohya GA4 loader（流量層）
 *
 * 設計（Felix 2026-11-15 批准）：
 *  - GA4 只做流量層：page_view／流量來源／頁面類型
 *  - 絕對唔送 purchase、絕對唔送 order_ref、絕對唔送任何交易事件
 *  - Consent Mode v2 + 預設拒絕：只有「已同意」而且有合法 GA_MEASUREMENT_ID
 *    先會載入 gtag.js；「只用必要」就永遠唔載入
 *  - Measurement ID 由 server 注入（views/partials/ga4-init.ejs → window.OH_GA4_ID），
 *    只喺值通過 /^G-[A-Z0-9]{4,20}$/ 時先渲染；未設定／唔合法 → 完全 no-op
 *  - 私隱收緊：allow_google_signals=false、allow_ad_personalization_signals=false、
 *    唔送 user_id、唔送 email/phone、唔送 session_id（GA 自己會派）
 *  - 撤回同意 → 移除 gtag.js script + 設 ga-disable 開關（雙重保險）
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    // Node（測試）：只匯出 factory，唔會自動啟動 DOM 邏輯
    module.exports = api;
  } else {
    // 瀏覽器：掛上 window.OHGa4 並自動啟動
    root.OHGa4 = api;
    api.autoInit(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GA4_ID_RE = /^G-[A-Z0-9]{4,20}$/;
  var GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=';

  // body data-analytics-page → GA4 page_type
  var PAGE_TYPE_MAP = {
    listing: 'category',
    product: 'product',
    guide: 'article',
    cart: 'cart',
  };

  function isValidMeasurementId(id) {
    return typeof id === 'string' && GA4_ID_RE.test(id.trim());
  }

  /**
   * 由 <body data-ga4-id> 或 window.OH_GA4_ID 讀 ID；
   * 讀唔到／唔合法 → ''（代表「完全唔載入 GA4」）。
   */
  function readMeasurementId(doc, win) {
    try {
      var body = doc && doc.body;
      if (body) {
        var raw = '';
        if (typeof body.getAttribute === 'function') raw = body.getAttribute('data-ga4-id');
        else if (body.dataset) raw = body.dataset.ga4Id;
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
      }
    } catch (e) {
      // fall through
    }
    try {
      // server 注入嘅 window 全域（views/partials/ga4-init.ejs）
      var g = win && win.OH_GA4_ID;
      if (typeof g === 'string' && g.trim()) return g.trim();
    } catch (e) {
      // fall through
    }
    return '';
  }

  function currentPageType(doc) {
    try {
      var body = doc && doc.body;
      if (!body || typeof body.getAttribute !== 'function') return 'other';
      var raw = body.getAttribute('data-analytics-page') || '';
      return PAGE_TYPE_MAP[raw] || 'other';
    } catch (e) {
      return 'other';
    }
  }

  function createLoader(options) {
    options = options || {};
    var win = options.window;
    var doc = options.document;
    var consent = options.consent || null; // { isGranted(): bool, subscribe(fn) }
    var id =
      typeof options.measurementId === 'string'
        ? options.measurementId.trim()
        : readMeasurementId(doc, win);

    var state = {
      id: id,
      loaded: false,      // gtag.js script 已插入？
      disabled: false,     // 撤回同意後停收集？
      pageViewSent: false, // page_view 已經送過（避免重複計數）
      scriptEl: null,     // 實際插入嘅 script element（撤回時移除）
    };

    function consentGranted() {
      try {
        return !!(consent && typeof consent.isGranted === 'function' && consent.isGranted());
      } catch (e) {
        return false;
      }
    }

    function gtag() {
      var layer = win.dataLayer = win.dataLayer || [];
      layer.push(arguments);
    }

    function scriptElement() {
      try {
        return doc.querySelector('script[data-ohya-ga4]');
      } catch (e) {
        return null;
      }
    }

    function removeScript() {
      try {
        var el = state.scriptEl || scriptElement();
        if (el && el.parentNode && typeof el.parentNode.removeChild === 'function') {
          el.parentNode.removeChild(el);
        }
      } catch (e) {
        // ignore
      }
      state.scriptEl = null;
    }

    /**
     * 載入 gtag.js + config；只有「已同意 + 合法 ID」先會行到。
     * 已載入過就唔會再插入第二次 script；page_view 每個頁面只送一次。
     */
    function load() {
      if (state.disabled) return false;
      if (!isValidMeasurementId(state.id)) return false; // 未設定／格式唔啱 → 靜默 no-op
      if (!consentGranted()) return false; // 未同意 → 靜默 no-op

      try {
        win.gtag = win.gtag || gtag;

        if (!state.loaded) {
          // Consent Mode v2：預設全部拒絕（廣告／個人化一律唔開），跟住只開 analytics
          win.gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
          });
          win.gtag('consent', 'update', {
            analytics_storage: 'granted',
          });

          var script = doc.createElement('script');
          script.async = true;
          script.src = GTAG_SRC + encodeURIComponent(state.id);
          script.setAttribute('data-ohya-ga4', '1');
          (doc.head || doc.documentElement || doc.body).appendChild(script);
          state.scriptEl = script;

          win.gtag('js', new Date());

          // 手動 config：page_view 由我哋自己控制（send_page_view: false）
          win.gtag('config', state.id, {
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            send_page_view: false,
            page_type: currentPageType(doc),
            page_path: (win.location && win.location.pathname) || '/',
          });

          state.loaded = true;
        }

        // 流量層唯一事件：page_view（冇 purchase、冇 order_ref、冇 session_id）
        if (!state.pageViewSent) {
          win.gtag('event', 'page_view', {
            page_type: currentPageType(doc),
            page_path: (win.location && win.location.pathname) || '/',
            page_location: (win.location && win.location.href) || '',
            page_title: (doc && doc.title) || '',
          });
          state.pageViewSent = true;
        }

        return true;
      } catch (e) {
        // fail-open：GA4 掛咗都唔影響頁面／落單
        return false;
      }
    }

    /**
     * 撤回同意：停收集
     *  - 移除 gtag.js script（實際唔再載入 GA）
     *  - 設 GA 官方 ga-disable 開關（雙重保險）
     */
    function disable() {
      state.disabled = true;
      state.loaded = false;
      // pageViewSent 唔重置：撤回之後再接受都唔會重複計 page_view（避免雙重計數）
      try {
        if (state.id && win) win['ga-disable-' + state.id] = true;
      } catch (e) {
        // ignore
      }
      removeScript();
      try {
        if (win && typeof win.gtag === 'function') {
          win.gtag('consent', 'update', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
          });
        }
      } catch (e) {
        // ignore
      }
      return true;
    }

    /**
     * 重新接受同意（撤回之後再接受）：
     *  - 清走 ga-disable 開關，令 GA 官方 tag 重新生效
     *  - 重新載入 gtag.js（page_view 只會再送一次，避免重複計數）
     */
    function enable() {
      state.disabled = false;
      try {
        if (state.id && win) {
          try {
            delete win['ga-disable-' + state.id];
          } catch (e) {
            win['ga-disable-' + state.id] = false;
          }
        }
      } catch (e) {
        // ignore
      }
      return true;
    }

    return {
      state: state,
      isValidMeasurementId: isValidMeasurementId,
      load: load,
      disable: disable,
      enable: enable,
      isLoaded: function () {
        return state.loaded;
      },
      hasGa4Script: function () {
        return !!scriptElement();
      },
    };
  }

  function autoInit(root) {
    if (!root || !root.document) return null;

    var loader = createLoader({
      window: root,
      document: root.document,
      consent: root.OHConsentManager || null,
    });
    root.OHGa4Loader = loader;

    // 已同意 → 即刻載入
    loader.load();

    // 之後接受／撤回都要跟住變
    var cm = root.OHConsentManager;
    function onConsentDetail(detail) {
      try {
        if (!detail) return;
        if (detail.analyticsStorage === 'granted') {
          loader.enable();
          loader.load();
        } else if (detail.analyticsStorage === 'denied') {
          loader.disable();
        }
      } catch (e) {
        // ignore
      }
    }
    if (cm && typeof cm.subscribe === 'function') {
      cm.subscribe(function (evt) {
        onConsentDetail(evt && evt.detail ? evt.detail : {});
      });
    } else if (typeof root.addEventListener === 'function') {
      root.addEventListener('ohya:consent-change', function (evt) {
        onConsentDetail(evt && evt.detail ? evt.detail : {});
      });
    }

    return loader;
  }

  return {
    GA4_ID_RE: GA4_ID_RE,
    GTAG_SRC: GTAG_SRC,
    isValidMeasurementId: isValidMeasurementId,
    readMeasurementId: readMeasurementId,
    createLoader: createLoader,
    autoInit: autoInit,
  };
});
