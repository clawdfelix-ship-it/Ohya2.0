/*!
 * Ohya cookie consent manager（GA4 流量層專用）
 *
 * 設計（Felix 2026-11-15 批准）：
 *  - 預設拒絕：未表態前 analytics_storage = denied，GA4 完全唔會載入
 *  - 三個動作：accept（接受分析）／reject（只用必要）／withdraw（撤回）
 *  - 同意狀態存 localStorage（key: ohya_consent_v1），唔用 cookie
 *  - 每次狀態變更都派 `ohya:consent-change` custom event（window 層面）
 *  - storage 讀寫全部 try/catch：private mode／被封存儲都唔會 crash
 *
 * 呢個檔案唔會直接載入任何第三方 script；載入 GA4 係 ga4.js 嘅責任。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    // Node（測試）：只匯出 factory，唔會自動啟動 DOM 邏輯
    module.exports = api;
  } else {
    // 瀏覽器：掛上 window.OHConsent 並自動啟動
    root.OHConsent = api;
    api.autoInit(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'ohya_consent_v1';
  var STORAGE_VERSION = 1;
  var CHANGE_EVENT = 'ohya:consent-change';

  var STATES = {
    UNKNOWN: 'unknown', // 未表態 → 等同拒絕（預設拒絕）
    GRANTED: 'granted',
    DENIED: 'denied',
  };

  function safeLocalStorage(win) {
    try {
      var ls = win && win.localStorage;
      if (!ls) return null;
      // 探試寫入：Safari private mode 會喺 setItem  throw
      var probe = '__ohya_ls_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  /**
   * 建立 consent 狀態機。
   * options:
   *   storage   - localStorage 類物件（可以 null）
   *   target    - 事件派發目標（window 類物件，可以 null）
   *   storageKey- 覆寫 storage key（測試用）
   *   now       - () => timestamp（測試用）
   */
  function createConsentManager(options) {
    options = options || {};
    var storage = options.storage === undefined ? null : options.storage;
    var target = options.target === undefined ? null : options.target;
    var storageKey = options.storageKey || STORAGE_KEY;
    var now = typeof options.now === 'function' ? options.now : function () { return Date.now(); };

    var memoryState = STATES.UNKNOWN; // storage 不可用時嘅 in-memory fallback

    function readStored() {
      try {
        if (!storage || typeof storage.getItem !== 'function') return null;
        var raw = storage.getItem(storageKey);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.version !== STORAGE_VERSION) return null;
        if (parsed.state !== STATES.GRANTED && parsed.state !== STATES.DENIED) return null;
        return parsed.state;
      } catch (e) {
        // storage 被封／壞掉 → 當成未表態（預設拒絕），唔 crash
        return null;
      }
    }

    function writeStored(state) {
      try {
        if (!storage || typeof storage.setItem !== 'function') return false;
        storage.setItem(storageKey, JSON.stringify({ version: STORAGE_VERSION, state: state, ts: now() }));
        return true;
      } catch (e) {
        return false;
      }
    }

    function clearStored() {
      try {
        if (storage && typeof storage.removeItem === 'function') storage.removeItem(storageKey);
      } catch (e) {
        // 忽略：撤回仍然喺 memory 生效
      }
    }

    function currentState() {
      var stored = readStored();
      if (stored) return stored;
      // storage 被封／讀唔到 → 用 memory fallback（Safari private mode 會出現呢種情況：
      // 否則使用者撳咗「接受分析」都唔會載入 GA4）
      if (memoryState !== STATES.UNKNOWN) return memoryState;
      return STATES.UNKNOWN;
    }

    function emit(state) {
      var detail = {
        state: state,
        analyticsStorage: state === STATES.GRANTED ? 'granted' : 'denied',
        decided: state !== STATES.UNKNOWN,
      };
      if (target && typeof target.dispatchEvent === 'function') {
        try {
          var evt;
          if (typeof CustomEvent === 'function') {
            evt = new CustomEvent(CHANGE_EVENT, { detail: detail });
          } else if (target.ownerDocument && target.ownerDocument.createEvent) {
            evt = target.ownerDocument.createEvent('CustomEvent');
            evt.initCustomEvent(CHANGE_EVENT, false, false, detail);
          } else {
            evt = { type: CHANGE_EVENT, detail: detail };
          }
          target.dispatchEvent(evt);
        } catch (e) {
          // 事件派發失敗唔影響同意狀態
        }
      }
      return detail;
    }

    function setState(state) {
      if (state === STATES.UNKNOWN) {
        clearStored();
      } else {
        writeStored(state);
      }
      memoryState = state;
      emit(state);
      return state;
    }

    return {
      STORAGE_KEY: storageKey,
      CHANGE_EVENT: CHANGE_EVENT,
      STATES: STATES,

      /** 'unknown' | 'granted' | 'denied' */
      getState: function () {
        return currentState();
      },

      /** 只有明確接受先係 true */
      isGranted: function () {
        return currentState() === STATES.GRANTED;
      },

      /** 使用者有冇表態過（未表態 = 預設拒絕） */
      isDecided: function () {
        return currentState() !== STATES.UNKNOWN;
      },

      accept: function () {
        return setState(STATES.GRANTED);
      },

      reject: function () {
        return setState(STATES.DENIED);
      },

      /** 撤回同意：回到未表態（分析即刻停），並派 change event */
      withdraw: function () {
        return setState(STATES.UNKNOWN);
      },

      subscribe: function (fn) {
        if (typeof fn !== 'function') return function () {};
        if (target && typeof target.addEventListener === 'function') {
          target.addEventListener(CHANGE_EVENT, fn);
          return function () {
            try { target.removeEventListener(CHANGE_EVENT, fn); } catch (e) {}
          };
        }
        return function () {};
      },
    };
  }

  // ---------------------------------------------------------------------
  // Browser DOM 層：banner 顯示／隱藏 + 按鈕 + footer「Cookie 設定」
  // ---------------------------------------------------------------------
  function autoInit(win) {
    if (!win || !win.document) return null;

    var manager = createConsentManager({
      storage: safeLocalStorage(win),
      target: win,
      storageKey: STORAGE_KEY,
    });
    win.OHConsentManager = manager;

    function doc() {
      return win.document;
    }

    function banner() {
      return doc().querySelector('[data-consent-banner]');
    }

    function showBanner(show) {
      var el = banner();
      if (!el) return;
      if (show) {
        el.removeAttribute('hidden');
        el.setAttribute('data-consent-visible', '1');
      } else {
        el.setAttribute('hidden', 'hidden');
        el.removeAttribute('data-consent-visible');
      }
    }

    function sync() {
      var state = manager.getState();
      var granted = state === STATES.GRANTED;
      showBanner(state === STATES.UNKNOWN);
      var withdrawBtn = doc().querySelector('[data-consent-withdraw]');
      if (withdrawBtn) {
        if (granted) withdrawBtn.removeAttribute('hidden');
        else withdrawBtn.setAttribute('hidden', 'hidden');
      }
    }

    function bind(selector, handler) {
      var els = doc().querySelectorAll(selector);
      for (var i = 0; i < els.length; i++) {
        els[i].addEventListener('click', function (ev) {
          ev.preventDefault();
          handler(ev);
        });
      }
    }

    function start() {
      sync();
      bind('[data-consent-accept]', function () {
        manager.accept();
        sync();
      });
      bind('[data-consent-reject]', function () {
        manager.reject();
        sync();
      });
      bind('[data-consent-withdraw]', function () {
        manager.withdraw();
        sync();
      });
      // Footer「Cookie 設定」→ 重新開個選擇畫面（可再改 / 撤回）
      bind('[data-consent-settings]', function () {
        showBanner(true);
      });
      manager.subscribe(function () {
        sync();
      });
    }

    if (doc().readyState === 'loading') {
      doc().addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    return manager;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    CHANGE_EVENT: CHANGE_EVENT,
    STATES: STATES,
    createConsentManager: createConsentManager,
    autoInit: autoInit,
  };
});
