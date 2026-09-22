/* ============================================================
   Ohya2.0 Touch UI — 高級觸控交互組件庫
   純原生 JS、零依賴，經 data-attr 自動初始化，桌面/手機皆可用。
   組件：
     [data-flip]      Flip to Detail（3D 翻轉詳情）
     [data-hold]      Hold to Confirm（長按確認）
     [data-slide]     Slide to Confirm（滑動確認）
     [data-radial]    Radial Menu（弧形菜單，由 FAB 觸發）
     [data-context]   Context Menu Preview（長按浮起預覽）
     .coverflow       Cover Flow（3D 輪播，由 initCoverFlow 建立）
   原則：手一碰就有反饋；未完成手勢平滑回退；尊重 prefers-reduced-motion。
   ============================================================ */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = reduced ? 0 : 260;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  const ease = 'cubic-bezier(.22,1,.36,1)';

  /* ----------------------------------------------------------
     Shared overlay/modal helpers
  ---------------------------------------------------------- */
  function openOverlay(node) {
    node.style.position = 'fixed';
    node.style.inset = '0';
    node.style.zIndex = '80';
    document.body.appendChild(node);
    requestAnimationFrame(() => { node.classList.add('is-open'); });
  }
  function closeOverlay(node) {
    node.classList.remove('is-open');
    setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, DUR);
  }

  /* ----------------------------------------------------------
     ① Flip to Detail
     用法：封面元素加 data-flip，data-flip-target = 詳情內容 selector
     （或 data-flip-html 提供 HTML）。點擊飛到中心、Y 軸翻轉。
  ---------------------------------------------------------- */
  function initFlip() {
    document.addEventListener('click', (ev) => {
      const trigger = ev.target.closest('[data-flip]');
      if (!trigger || trigger.dataset.flipBound) return;
      // 只在有 data 的元素首次標記；用事件委托故無需逐個綁
    });
    $all('[data-flip]').forEach(trigger => {
      if (trigger.dataset.flipReady) return;
      trigger.dataset.flipReady = '1';
      trigger.addEventListener('click', (ev) => {
        ev.preventDefault();
        const contentHTML = trigger.dataset.flipHtml
          || ($(trigger.dataset.flipTarget) ? $(trigger.dataset.flipTarget).innerHTML : '');
        const rect = trigger.getBoundingClientRect();

        const overlay = el('div', { class: 'flip-overlay' });
        const card = el('div', { class: 'flip-card' }, [
          el('button', { class: 'flip-close', type: 'button', 'aria-label': '關閉', text: '×' }),
          el('div', { class: 'flip-back' }),
        ]);
        $('.flip-back', card).innerHTML = contentHTML;
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // 起點：封面位置
        card.style.transition = 'none';
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        card.style.width = rect.width + 'px';
        card.style.height = rect.height + 'px';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          card.style.transition = `transform ${DUR}ms ${ease}, left ${DUR}ms ${ease}, top ${DUR}ms ${ease}, width ${DUR}ms ${ease}, height ${DUR}ms ${ease}`;
          const targetW = Math.min(window.innerWidth - 24, 460);
          card.style.left = ((window.innerWidth - targetW) / 2) + 'px';
          card.style.top = '8vh';
          card.style.width = targetW + 'px';
          card.style.height = 'auto';
          card.classList.add('is-flipped');
        }));

        const shut = () => {
          card.classList.remove('is-flipped');
          card.style.left = rect.left + 'px';
          card.style.top = rect.top + 'px';
          card.style.width = rect.width + 'px';
          card.style.height = rect.height + 'px';
          overlay.classList.remove('is-open');
          setTimeout(() => overlay.remove(), DUR);
        };
        $('.flip-close', card).addEventListener('click', shut);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) shut(); });
        requestAnimationFrame(() => overlay.classList.add('is-open'));
      });
    });
  }

  /* ----------------------------------------------------------
     ② Hold to Confirm
     用法：<button data-hold data-hold-ms="700">，按住邊緣畫環；
     完成觸發 'hold-confirm' 事件（由頁面執行真正動作）。
  ---------------------------------------------------------- */
  function initHold() {
    $all('[data-hold]').forEach(btn => {
      if (btn.dataset.holdReady) return;
      btn.dataset.holdReady = '1';
      const ms = parseInt(btn.dataset.holdMs || '700', 10);
      btn.classList.add('hold-btn');
      const svgNS = 'http://www.w3.org/2000/svg';
      const ring = document.createElementNS(svgNS, 'svg');
      ring.setAttribute('class', 'hold-ring');
      const circ = document.createElementNS(svgNS, 'circle');
      circ.setAttribute('class', 'hold-ring-c');
      ring.appendChild(circ);
      btn.appendChild(ring);

      let raf = null, start = 0, done = false;
      function sizeRing() {
        const r = btn.getBoundingClientRect();
        const cx = r.width / 2, cy = r.height / 2, rad = Math.min(cx, cy) - 3;
        ring.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
        circ.setAttribute('cx', cx); circ.setAttribute('cy', cy);
        circ.setAttribute('r', rad);
        circ.style.strokeDasharray = (2 * Math.PI * rad);
        circ.style.strokeDashoffset = (2 * Math.PI * rad);
        btn._circLen = 2 * Math.PI * rad;
      }
      function tick(t) {
        if (!start) start = t;
        const p = Math.min((t - start) / ms, 1);
        circ.style.strokeDashoffset = String(btn._circLen * (1 - p));
        if (p >= 1) { done = true; btn.dispatchEvent(new CustomEvent('hold-confirm')); btn.classList.remove('is-holding'); return; }
        raf = requestAnimationFrame(tick);
      }
      function begin(e) {
        if (done) return;
        e.preventDefault();
        sizeRing();
        btn.classList.add('is-holding');
        start = 0;
        raf = requestAnimationFrame(tick);
      }
      function cancel() {
        if (done) return;
        cancelAnimationFrame(raf);
        btn.classList.remove('is-holding');
        circ.style.transition = 'stroke-dashoffset 180ms ' + ease;
        circ.style.strokeDashoffset = String(btn._circLen);
        setTimeout(() => { circ.style.transition = ''; }, 200);
      }
      btn.addEventListener('pointerdown', begin);
      btn.addEventListener('pointerup', cancel);
      btn.addEventListener('pointerleave', cancel);
      btn.addEventListener('pointercancel', cancel);
    });
  }

  /* ----------------------------------------------------------
     ⑥ Slide to Confirm
     用法：容器 [data-slide]，內含 thumb；超過 80% 觸發，否則彈回。
  ---------------------------------------------------------- */
  function initSlide() {
    $all('[data-slide]').forEach(track => {
      if (track.dataset.slideReady) return;
      track.dataset.slideReady = '1';
      const thumb = $('.slide-thumb', track);
      let max = 0, dragging = false, startX = 0, x = 0, fired = false;
      function layout() { max = track.clientWidth - thumb.offsetWidth - 4; }
      function setX(v, animate) {
        x = Math.max(0, Math.min(v, max));
        thumb.style.transition = animate ? `transform 200ms ${ease}` : 'none';
        thumb.style.transform = `translateX(${x}px)`;
        track.style.setProperty('--slide-p', String(x / (max || 1)));
      }
      thumb.addEventListener('pointerdown', e => {
        if (fired) return;
        layout(); dragging = true; startX = e.clientX - x;
        thumb.setPointerCapture(e.pointerId);
      });
      thumb.addEventListener('pointermove', e => {
        if (!dragging) return;
        setX(e.clientX - startX, false);
      });
      function end() {
        if (!dragging) return;
        dragging = false;
        if (x / (max || 1) >= 0.8) {
          fired = true;
          setX(max, true);
          track.classList.add('is-confirmed');
          track.dispatchEvent(new CustomEvent('slide-confirmed'));
        } else {
          setX(0, true);
        }
      }
      thumb.addEventListener('pointerup', end);
      thumb.addEventListener('pointercancel', () => { dragging = false; setX(0, true); });
      window.addEventListener('resize', layout);
      setTimeout(layout, 0);
    });
  }

  /* ----------------------------------------------------------
     ⑤ Radial Menu
     用法：FAB 按鈕 [data-radial]，data-items = JSON
     [{label,icon,action?}]，或用 [data-radial-item] 子項。
     長按/點擊展開弧形，交錯彈出；滑過放大顯示標籤。
  ---------------------------------------------------------- */
  function initRadial() {
    $all('[data-radial]').forEach(fab => {
      if (fab.dataset.radialReady) return;
      fab.dataset.radialReady = '1';
      let items = [];
      try { items = JSON.parse(fab.dataset.items || '[]'); } catch (e) { items = []; }
      let opened = false, wrap = null;

      function build() {
        wrap = el('div', { class: 'radial-wrap' });
        const arc = el('div', { class: 'radial-arc' });
        const n = items.length;
        items.forEach((it, i) => {
          const b = el('button', {
            class: 'radial-item', type: 'button', 'aria-label': it.label,
            style: `--i:${i};--n:${Math.max(n - 1, 1)}`,
          }, [el('span', { class: 'radial-item-icon', text: it.icon || '•' }), el('span', { class: 'radial-item-label', text: it.label })]);
          b.addEventListener('click', () => {
            if (typeof window[it.action] === 'function') window[it.action]();
            b.dispatchEvent(new CustomEvent('radial-pick', { detail: it, bubbles: true }));
            hide();
          });
          arc.appendChild(b);
        });
        wrap.appendChild(arc);
        wrap.addEventListener('click', e => { if (e.target === wrap) hide(); });
      }
      function show() {
        build();
        document.body.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add('is-open'));
        opened = true;
        fab.classList.add('is-active');
      }
      function hide() {
        if (!wrap) return;
        wrap.classList.remove('is-open');
        const w = wrap;
        setTimeout(() => w.remove(), DUR);
        wrap = null; opened = false;
        fab.classList.remove('is-active');
      }
      fab.addEventListener('click', e => { e.preventDefault(); opened ? hide() : show(); });
    });
  }

  /* ----------------------------------------------------------
     ⑦ Context Menu Preview
     用法：列表項 [data-context]，data-actions = JSON
     [{label,icon,kind?,action?}]。長按觸發，背景模糊、項浮起。
  ---------------------------------------------------------- */
  function initContext() {
    $all('[data-context]').forEach(item => {
      if (item.dataset.ctxReady) return;
      item.dataset.ctxReady = '1';
      let timer = null, fired = false;
      item.addEventListener('pointerdown', () => {
        fired = false;
        timer = setTimeout(() => { fired = true; open(); }, 420);
      });
      ['pointerup', 'pointermove', 'pointercancel'].forEach(ev =>
        item.addEventListener(ev, () => clearTimeout(timer)));
      item.addEventListener('click', e => { if (fired) { e.preventDefault(); fired = false; } });

      function open() {
        let actions = [];
        try { actions = JSON.parse(item.dataset.actions || '[]'); } catch (e) {}
        if (!actions.length) return;
        if (navigator.vibrate) navigator.vibrate(12);
        const overlay = el('div', { class: 'ctx-overlay' });
        const card = el('div', { class: 'ctx-card' });
        actions.forEach(a => {
          const b = el('button', {
            class: 'ctx-action' + (a.kind === 'danger' ? ' is-danger' : ''), type: 'button',
          }, [el('span', { class: 'ctx-action-icon', text: a.icon || '' }), el('span', { text: a.label })]);
          b.addEventListener('click', () => {
            if (typeof window[a.action] === 'function') window[a.action]();
            item.dispatchEvent(new CustomEvent('context-pick', { detail: a, bubbles: true }));
            hide();
          });
          card.appendChild(b);
        });
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-open'));
        function hide() {
          overlay.classList.remove('is-open');
          setTimeout(() => overlay.remove(), DUR);
        }
        overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
      }
    });
  }

  /* ----------------------------------------------------------
     ⑩ Cover Flow
     用法：容器 <div class="coverflow" data-cover='[{html|img,title}]'>
     橫向 3D 透視輪播，當前居中放大。返回 API {next,prev}。
  ---------------------------------------------------------- */
  window.initCoverFlow = function (root, items) {
    items = items || [];
    try { items = items.length ? items : JSON.parse(root.dataset.cover || '[]'); } catch (e) { items = []; }
    root.classList.add('coverflow');
    const track = el('div', { class: 'coverflow-track' });
    root.appendChild(track);
    let idx = 0;
    function render() {
      track.innerHTML = '';
      items.forEach((it, i) => {
        const s = el('div', { class: 'coverflow-slide' + (i === idx ? ' is-active' : '') });
        if (it.img) s.appendChild(el('img', { src: it.img, alt: it.title || '', loading: 'lazy' }));
        else if (it.html) s.innerHTML = it.html;
        s.style.setProperty('--rel', String(i - idx));
        s.addEventListener('click', () => { if (i !== idx) go(i); });
        track.appendChild(s);
      });
      root.dispatchEvent(new CustomEvent('coverflow-change', { detail: { index: idx, item: items[idx] } }));
    }
    function go(i) { idx = (i + items.length) % items.length; render(); }
    // drag / swipe
    let sx = null;
    root.addEventListener('pointerdown', e => { sx = e.clientX; });
    root.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 36) go(idx + (dx < 0 ? 1 : -1));
      sx = null;
    });
    render();
    return { next: () => go(idx + 1), prev: () => go(idx - 1), go };
  };

  /* ----------------------------------------------------------
     ⑪ Focus Group（選中一張，其他後退）
     用法：容器加 data-focus-group；內裡每一項加 data-focus-item。
     桌面 hover 聚焦；觸控點一下選中（其他降飽和＋縮小＋微模糊），
     再點選中項內嘅連結先會導航。點空白處解除。
  ---------------------------------------------------------- */
  function initFocusGroups() {
    $all('[data-focus-group]').forEach(group => {
      if (group.dataset.focusBound) return;
      group.dataset.focusBound = '1';
      const items = () => $all('[data-focus-item]', group);

      // 桌面：hover 即聚焦，離開還原
      group.addEventListener('pointerover', (ev) => {
        const item = ev.target.closest('[data-focus-item]');
        if (!item || window.matchMedia('(hover: none)').matches) return;
        items().forEach(it => {
          it.classList.toggle('is-dim', it !== item);
          it.classList.toggle('is-spotlit', it === item);
        });
      });
      group.addEventListener('pointerout', (ev) => {
        if (window.matchMedia('(hover: none)').matches) return;
        if (!ev.relatedTarget || !group.contains(ev.relatedTarget)) {
          items().forEach(it => it.classList.remove('is-dim', 'is-spotlit'));
        }
      });

      // 觸控：點擊切換選中；未選中時先攔截導航
      group.addEventListener('click', (ev) => {
        if (!window.matchMedia('(hover: none)').matches) return;
        const item = ev.target.closest('[data-focus-item]');
        if (!item) {
          items().forEach(it => it.classList.remove('is-dim', 'is-spotlit'));
          return;
        }
        if (!item.classList.contains('is-spotlit')) {
          // 第一次點：只選中，唔導航
          ev.preventDefault();
          ev.stopPropagation();
          items().forEach(it => {
            const on = it === item;
            it.classList.toggle('is-spotlit', on);
            it.classList.toggle('is-dim', !on);
          });
        }
        // 已選中：放行內部連結／按鈕（默認行為照走）
      }, true);
    });
  }

  function initAll() {
    initFlip();
    initHold();
    initSlide();
    initRadial();
    initContext();
    initFocusGroups();
    $all('.coverflow').forEach(r => window.initCoverFlow(r));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
  // 動態插入嘅內容可手動重跑
  window.TouchUI = { init: initAll };
})();
