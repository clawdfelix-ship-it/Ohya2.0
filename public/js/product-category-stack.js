/*
 * Ohya2.0 stacked category disclosure.
 * Independently implemented with native DOM events; no third-party code or assets.
 * One click and one keyboard listener serve the whole product grid (no per-card listeners).
 */
(function initProductCategoryStacks() {
  'use strict';

  function start() {
    var stacks = Array.from(document.querySelectorAll('[data-category-stack]'));
    if (!stacks.length) return;

    var fineHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');
    var canHover = function () { return Boolean(fineHover && fineHover.matches); };
    var pinned = new WeakMap();
    var pointerTouch = new WeakMap();
    var focusIntent = new WeakMap();

    function parts(stack) {
      return {
        trigger: stack.querySelector('[data-category-stack-trigger]'),
        panel: stack.querySelector('[data-category-stack-links]'),
        links: Array.from(stack.querySelectorAll('[data-category-stack-link]')),
      };
    }

    function setExpanded(stack, expanded) {
      var elements = parts(stack);
      if (!elements.trigger || !elements.panel) return;
      stack.classList.toggle('is-expanded', expanded);
      elements.trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      elements.panel.hidden = !expanded;
      if (!expanded) pinned.set(stack, false);
    }

    function stackFor(target) {
      return target && target.closest ? target.closest('[data-category-stack]') : null;
    }

    stacks.forEach(function (stack) {
      setExpanded(stack, false);
      stack.addEventListener('pointerdown', function (event) {
        pointerTouch.set(stack, event.pointerType !== 'mouse');
        if (event.target.closest && event.target.closest('[data-category-stack-trigger]')) {
          focusIntent.set(stack, false);
        }
      });
      stack.addEventListener('focusin', function () {
        // Touch focus precedes click. A mouse click can close a focused trigger,
        // and Escape restores focus after closing; neither should reopen the panel.
        if (focusIntent.get(stack) === false) {
          focusIntent.delete(stack);
          return;
        }
        if (!pointerTouch.get(stack) || canHover()) setExpanded(stack, true);
      });
      stack.addEventListener('focusout', function (event) {
        if (!event.relatedTarget || !stack.contains(event.relatedTarget)) {
          if (!pinned.get(stack) || canHover()) setExpanded(stack, false);
        }
      });
      stack.addEventListener('pointerenter', function (event) {
        if (event.pointerType && event.pointerType !== 'mouse') {
          pointerTouch.set(stack, true);
        }
        if (canHover() && (!event.pointerType || event.pointerType === 'mouse')) {
          setExpanded(stack, true);
        }
      });
      stack.addEventListener('pointerleave', function (event) {
        if (canHover() && !pinned.get(stack)
            && (!event.pointerType || event.pointerType === 'mouse')) {
          setExpanded(stack, false);
        }
      });
    });

    document.addEventListener('click', function (event) {
      var stack = stackFor(event.target);
      var trigger = event.target && event.target.closest
        ? event.target.closest('[data-category-stack-trigger]') : null;
      if (stack && trigger && stack.contains(trigger)) {
        if (pinned.get(stack)) {
          setExpanded(stack, false);
        } else {
          setExpanded(stack, true);
          pinned.set(stack, true);
        }
        return;
      }
      stacks.forEach(function (entry) {
        if (entry !== stack) setExpanded(entry, false);
      });
    });

    document.addEventListener('keydown', function (event) {
      var stack = stackFor(event.target);
      if (!stack) return;
      var elements = parts(stack);
      if (!elements.trigger) return;

      if (event.key === 'Escape') {
        setExpanded(stack, false);
        focusIntent.set(stack, false);
        elements.trigger.focus();
        event.preventDefault();
        return;
      }
      if (event.target === elements.trigger && (event.key === 'Enter' || event.key === ' ')) {
        var expand = elements.trigger.getAttribute('aria-expanded') !== 'true';
        setExpanded(stack, expand);
        pinned.set(stack, expand);
        event.preventDefault();
        return;
      }

      var index = elements.links.indexOf(event.target);
      if (index < 0) return;
      var nextIndex = null;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        nextIndex = (index + 1) % elements.links.length;
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + elements.links.length) % elements.links.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = elements.links.length - 1;
      }
      if (nextIndex !== null) {
        setExpanded(stack, true);
        elements.links[nextIndex].focus();
        event.preventDefault();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) return;
      stacks.forEach(function (stack) { setExpanded(stack, false); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
