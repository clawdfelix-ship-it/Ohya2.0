/**
 * Ohya2.0 Fluid Interactions
 * Progressive enhancement layer. No dependencies.
 *
 *  - 03 RIPPLE : waves emanate from the pointer position
 *  - 04 BURST  : particle burst for [data-fluid-burst] (add-to-cart success)
 *  - 07 COUNT  : cart badge spring-pop (hooked from cart-client via MZFluid)
 *  - 10 MORPH  : hamburger <-> X drives the existing mobile drawer
 *
 * Everything is disabled under prefers-reduced-motion.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 03 RIPPLE ---------------------------------------------------------- */
  function spawnRipple(btn, x, y) {
    if (reduceMotion) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var r = document.createElement('span');
    r.className = 'fluid-ripple';
    // pointer relative to the button; fall back to centre
    var px = (x != null) ? x - rect.left : rect.width / 2;
    var py = (y != null) ? y - rect.top : rect.height / 2;
    r.style.width = r.style.height = size + 'px';
    r.style.left = px - size / 2 + 'px';
    r.style.top = py - size / 2 + 'px';
    btn.appendChild(r);
    r.addEventListener('animationend', function () { r.remove(); });
  }

  function nearestPress(node) {
    return node && node.closest ? node.closest('.fluid-press') : null;
  }

  if (!reduceMotion) {
    // pointerdown gives the truest finger position and reacts before click
    document.addEventListener('pointerdown', function (e) {
      var btn = nearestPress(e.target);
      if (btn) spawnRipple(btn, e.clientX, e.clientY);
    }, { passive: true });

    // keyboard activation (Enter/Space) ripples from centre
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var btn = nearestPress(e.target);
      if (btn && btn === document.activeElement) spawnRipple(btn, null, null);
    });
  }

  /* ---- 04 BURST ----------------------------------------------------------- */
  var BURST_COLORS = ['#dc2626', '#ef4444', '#f59e0b', '#fbbf24', '#fb7185'];
  function burstFrom(el) {
    if (reduceMotion || !el) return;
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var N = 10;
    for (var i = 0; i < N; i++) {
      var p = document.createElement('span');
      p.className = 'fluid-burst-particle';
      var ang = (Math.PI * 2 * i) / N + Math.random() * 0.4;
      var dist = 42 + Math.random() * 34;
      p.style.setProperty('--bx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--by', Math.sin(ang) * dist + 'px');
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = BURST_COLORS[i % BURST_COLORS.length];
      document.body.appendChild(p);
      p.addEventListener('animationend', function () { this.remove(); });
    }
    el.classList.remove('fluid-burst-pop');
    void el.offsetWidth; // restart animation
    el.classList.add('fluid-burst-pop');
  }

  /* ---- 05 DRAW checkmark SVG (used by the success toast) ------------------ */
  function checkSvg() {
    return (
      '<svg class="fluid-check" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle class="fluid-check__circle" cx="12" cy="12" r="10"></circle>' +
      '<path class="fluid-check__tick" d="M7.5 12.5l3 3 6-6.5"></path>' +
      '</svg>'
    );
  }

  /* ---- 07 COUNT badge pop ------------------------------------------------- */
  function popBadge() {
    var badge = document.getElementById('cart-count');
    if (!badge || reduceMotion) return;
    badge.classList.remove('fluid-badge-pop');
    void badge.offsetWidth;
    badge.classList.add('fluid-badge-pop');
  }

  /* ---- auto-enrich real controls with press + ripple --------------------- */
  var PRESS_SELECTOR = [
    '[data-add-to-cart]',
    'button[type="submit"]',
    '.mz-btn-primary',
    '.c-btn--primary',
    '.page-link',
    '[data-qty-plus]',
    '[data-qty-minus]',
  ].join(',');

  function looksLight(el) {
    var c = el.className || '';
    var dark = /bg-red|bg-gray-9|bg-black|bg-neutral-9/.test(c);
    var light = /bg-white|border\b/.test(c);
    return light && !dark;
  }

  function enrich(root) {
    if (reduceMotion) return;
    var nodes = (root || document).querySelectorAll(PRESS_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('fluid-press')) continue;
      el.classList.add('fluid-press');
      if (looksLight(el)) el.classList.add('fluid-press--dark');
    }
  }

  /* ---- 10 MORPH hamburger + drawer (single owner) ----------------------- */
  function initBurger() {
    var panel = document.getElementById('mz-mobile-menu-panel');
    var openBtn = document.querySelector('[data-mobile-menu-open]');
    var burger = openBtn ? openBtn.querySelector('.mz-burger') : null;
    if (!panel || !burger) return;

    var open = false;
    function setOpen(next) {
      open = next;
      panel.classList.toggle('is-open', next);
      burger.classList.toggle('is-open', next);
      document.body.classList.toggle('overflow-hidden', next);
      if (openBtn) openBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    }
    openBtn.addEventListener('click', function () { setOpen(true); });
    panel.querySelectorAll('[data-mobile-menu-close]').forEach(function (b) {
      b.addEventListener('click', function () { setOpen(false); });
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enrich(); initBurger(); });
  } else {
    enrich();
    initBurger();
  }
  // late-rendered lists (pagination/filter swaps) get enriched too
  document.addEventListener('mz:dom-updated', function (e) { enrich(e.target || document); });

  /* ---- public hooks for cart-client --------------------------------------- */
  window.MZFluid = {
    burstFrom: burstFrom,
    popBadge: popBadge,
    checkSvg: checkSvg,
    reduceMotion: reduceMotion,
  };
})();
