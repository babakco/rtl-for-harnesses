/* ---------------------------------------------------------------------------
 * dsh-rtl.js - DeepSeek Harness RTL patch (direction engine)
 *
 * Contract this file implements
 * ----------------------------
 * A sentence or paragraph renders RTL if *anywhere* inside it there is at
 * least one Arabic-script character, even when the paragraph opens with
 * English words or punctuation. CSS alone cannot express that: both
 * `dir=auto` and `unicode-bidi: plaintext` key off the *first strong*
 * character, so "API docs: این روش کار می‌کند" would stay LTR. Hence a JS
 * pass that decides per block and writes a real `dir` attribute.
 *
 * Design notes
 * ------------
 *  - One pass maps every text node to its nearest *block* owner, aggregates
 *    "does this block contain any Arabic-script character", then marks that
 *    block. Granularity is the paragraph, not the word.
 *  - Code, terminals, math and diffs are hard-excluded. Reordering them is
 *    never correct, and they are the quickest way to make a patch look
 *    broken.
 *  - A MutationObserver re-runs the pass over only the mutated subtrees, so
 *    streaming assistant output flips to RTL as it arrives.
 *  - Attributes the app itself wrote are respected; this file only manages
 *    `dir` values it authored (tracked in a WeakSet).
 *  - No getComputedStyle anywhere: owner lookup is a static tag test, so a
 *    full sweep stays cheap enough to run on every render.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  if (window.__DSH_RTL_INSTALLED__) return;
  window.__DSH_RTL_INSTALLED__ = true;

  /* Arabic, Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms-A
     and -B. The presentation forms matter because text sometimes arrives
     pre-shaped from copy/paste or from office/PDF conversion. */
  var SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  var CONFIG = {
    /* Debug escape hatch: window.__DSH_RTL_DISABLED__ = true halts the engine. */
    sweepIntervalMs: 3000
  };

  /* Elements that own a "paragraph" for direction purposes. Inline tags
     (span, a, b, strong, em) are deliberately absent: their text merges into
     the surrounding block, which is the granularity the contract asks for. */
  var BLOCK_SELECTOR = [
    'p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer',
    'nav', 'form', 'fieldset', 'figure', 'figcaption', 'blockquote', 'address',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'pre', 'button', 'label', 'legend', 'summary', 'details', 'option',
    'textarea', 'input', 'output', 'dialog'
  ].join(',');

  /* Never touched, whatever their content: rendered by engines that own
     their own bidi (xterm, KaTeX, Monaco), or are code payloads. */
  var FORCE_LTR_SELECTOR = [
    'pre', 'code', 'kbd', 'samp', 'tt', 'var',
    '.xterm', '.xterm-screen', '.xterm-rows', '.xterm-viewport',
    '.monaco-editor', '.monaco-diff-editor',
    '.katex', '.katex-display', '.math'
  ].join(',');

  var CONTROL_SELECTOR = 'input,textarea';

  var owned = new WeakSet();      /* elements whose dir this file authored */
  var forcedLtr = new WeakSet();   /* elements tagged for the CSS opt-out   */

  function isDisabled() {
    return window.__DSH_RTL_DISABLED__ === true;
  }

  /* ------------------------------------------------------------------ */
  /* element helpers                                                     */
  /* ------------------------------------------------------------------ */

  function asElement(node) {
    return node && node.nodeType === 1 ? node : null;
  }

  /* Walks up to the nearest block container that owns `textNode`. Falls back
     to the direct parent when the climb reaches the document root, so a bare
     text node under #root cannot flip the entire application. */
  function ownerOf(textNode) {
    var parent = textNode.parentElement;
    if (!parent) return null;
    var found = parent.closest(BLOCK_SELECTOR);
    if (!found) {
      return parent === document.body || parent === document.documentElement
        ? null
        : parent;
    }
    if (found === document.body || found === document.documentElement) {
      return parent === found ? null : parent;
    }
    return found;
  }

  function setDirection(el, direction) {
    if (!el) return;
    if (direction === 'rtl') {
      if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
      owned.add(el);
      return;
    }
    /* Only clear a dir value we wrote; an app-authored dir is left alone. */
    if (owned.has(el)) {
      el.removeAttribute('dir');
      owned.delete(el);
    }
  }

  function applyForcedLtr(el, force) {
    if (force) {
      if (!forcedLtr.has(el)) {
        el.setAttribute('data-dsh-rtl-force-ltr', '');
        forcedLtr.add(el);
      }
    } else if (forcedLtr.has(el)) {
      el.removeAttribute('data-dsh-rtl-force-ltr');
      forcedLtr.delete(el);
    }
  }

  /* ------------------------------------------------------------------ */
  /* the sweep                                                           */
  /* ------------------------------------------------------------------ */

  var walker = null;

  function getWalker(root) {
    if (!walker) {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          var parent = node.parentElement;
          if (parent && parent.closest(FORCE_LTR_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    }
    walker.currentNode = root;
    return walker;
  }

  /**
   * Walk `root`, group its text nodes by owning block, then set dir on each
   * block according to whether it holds any Arabic-script character.
   * @param {Node} root subtree to process
   */
  function sweep(root) {
    if (isDisabled()) return;
    var scope = asElement(root) || document.body;
    if (!scope) return;

    var blockState = new Map(); /* owner -> hasScript */

    var w = getWalker(scope);
    var node;
    while ((node = w.nextNode())) {
      var owner = ownerOf(node);
      if (!owner) continue;
      if (blockState.get(owner) === true) continue; /* already Persian */
      if (SCRIPT_RE.test(node.nodeValue)) blockState.set(owner, true);
      else if (blockState.get(owner) === undefined) blockState.set(owner, false);
    }

    blockState.forEach(function (hasScript, owner) {
      applyForcedLtr(owner, false);
      setDirection(owner, hasScript ? 'rtl' : 'ltr');
    });
  }

  function sweepAll() {
    sweep(document.body);
  }

  /* ------------------------------------------------------------------ */
  /* editable fields                                                     */
  /* ------------------------------------------------------------------ */

  function syncField(field) {
    if (isDisabled()) return;
    var value;
    if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
      value = field.value || '';
    } else {
      value = field.textContent || '';
    }
    if (!value) {
      setDirection(field, 'ltr');
      return;
    }
    setDirection(field, SCRIPT_RE.test(value) ? 'rtl' : 'ltr');
  }

  function handleControlEvent(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.matches(CONTROL_SELECTOR)) return;
    if (target.closest(FORCE_LTR_SELECTOR)) return;
    syncField(target);
  }

  /* A Persian placeholder decides the caret side before anything is typed. */
  function syncPlaceholders(root) {
    var scope = asElement(root) || document.body;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    var fields = scope.querySelectorAll('input[placeholder], textarea[placeholder]');
    for (var i = 0; i < fields.length; i++) {
      var placeholder = fields[i].getAttribute('placeholder') || '';
      if (placeholder && SCRIPT_RE.test(placeholder)) setDirection(fields[i], 'rtl');
    }
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                              */
  /* ------------------------------------------------------------------ */

  function installObserver() {
    var pending = new Set();
    var scheduled = false;

    function flush() {
      scheduled = false;
      var roots = Array.from(pending);
      pending.clear();
      for (var i = 0; i < roots.length; i++) {
        var root = roots[i];
        if (!root.isConnected) continue;
        sweep(root);
        syncPlaceholders(root);
      }
    }

    function schedule(node) {
      var el = asElement(node);
      if (!el) el = node && node.parentElement ? node.parentElement : null;
      if (!el) return;
      pending.add(el);
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }

    var observer = new MutationObserver(function (records) {
      if (isDisabled()) return;
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === 'characterData') {
          schedule(record.target);
        } else if (record.type === 'childList') {
          for (var j = 0; j < record.addedNodes.length; j++) {
            schedule(record.addedNodes[j]);
          }
          /* A removed subtree may have held the last Persian character in its
             block, so re-check the parent as well. */
          if (record.removedNodes.length && record.target) schedule(record.target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return observer;
  }

  function start() {
    sweepAll();
    syncPlaceholders(document.body);
    installObserver();

    /* Capture phase so the direction is correct before the app reacts. */
    document.addEventListener('input', handleControlEvent, true);
    document.addEventListener('change', handleControlEvent, true);

    /* Low-frequency revalidation clears stale marks if the app reuses a node
       and rewrites its text without a mutation we observed. */
    setInterval(function () {
      if (!isDisabled()) sweepAll();
    }, CONFIG.sweepIntervalMs);

    window.addEventListener('focus', function () {
      if (!isDisabled()) sweepAll();
    });

    document.documentElement.setAttribute('data-dsh-rtl', 'on');
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
