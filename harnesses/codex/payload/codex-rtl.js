(function () {
'use strict';
try { document.documentElement.dataset.codexRtl = "1"; } catch (e) {}
const RTL_RANGES = [
  [0x0590, 0x05FF],
  [0x0600, 0x06FF],
  [0x0750, 0x077F],
  [0x08A0, 0x08FF],
  [0xFB50, 0xFDFF],
  [0xFE70, 0xFEFF]
];

function hasRTLChar(ch) {
  const cp = String(ch).codePointAt(0);
  if (cp === undefined) {
    return false;
  }
  if (cp === 0x200C) {
    return true;
  }
  for (const [lo, hi] of RTL_RANGES) {
    if (cp >= lo && cp <= hi) {
      return true;
    }
  }
  return false;
}

function hasRTL(text) {
  for (const ch of String(text)) {
    if (hasRTLChar(ch)) {
      return true;
    }
  }
  return false;
}

function detectDir(text) {
  if (!text) {
    return 'ltr';
  }
  return hasRTL(text) ? 'rtl' : 'ltr';
}
var CODEX_RTL_BATCH_MS = 50;
var CODEX_RTL_MAX_ROOTS = 200;
var CODEX_RTL_BLOCKS = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'TH', 'DIV', 'SUMMARY', 'DT', 'DD', 'FIGCAPTION'];

function isExcluded(el) {
  if (!el) {
    return false;
  }
  var tag = String(el.tagName || '').toUpperCase();
  if (tag === 'PRE' || tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'SVG' || tag === 'MATH') {
    return true;
  }
  var cls = String(el.className || '');
  if (cls.indexOf('katex') !== -1 || cls.indexOf('language-') !== -1 || cls.indexOf('icon') !== -1) {
    return true;
  }
  if (typeof el.closest === 'function') {
    try {
      if (el.closest('pre,code,kbd,samp,button,a,input,textarea,select,svg,math')) {
        return true;
      }
      if (el.closest('.katex,.katex-display,mjx-container,math,[role=button],[class*=icon],[class*=language-]')) {
        return true;
      }
    } catch (err) {
      return false;
    }
  }
  return false;
}

function processTextNode(text, parentEl) {
  if (isExcluded(parentEl)) {
    return 'skip';
  }
  return detectDir(text);
}

function findBlock(el) {
  var node = el;
  var fallback = null;
  while (node && node.nodeType === 1) {
    var tag = String(node.tagName || '').toUpperCase();
    if (CODEX_RTL_BLOCKS.indexOf(tag) !== -1) {
      return node;
    }
    if (fallback === null && tag !== 'HTML' && tag !== 'HEAD' && tag !== 'BODY') {
      fallback = node;
    }
    node = node.parentElement;
  }
  return fallback || el;
}

function isSettableBlock(block) {
  if (!block || block.nodeType !== 1) {
    return false;
  }
  var tag = String(block.tagName || '').toUpperCase();
  if (tag === 'HTML' || tag === 'HEAD' || tag === 'BODY') {
    return false;
  }
  if (typeof block.hasAttribute === 'function' && block.hasAttribute('dir')) {
    return false;
  }
  return true;
}

function scanShadows(root, observe) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }
  var els;
  try {
    els = root.querySelectorAll('*');
  } catch (err) {
    return;
  }
  for (var i = 0; i < els.length; i++) {
    var sh = null;
    try {
      sh = els[i] ? els[i].shadowRoot : null;
    } catch (err2) {
      sh = null;
    }
    if (sh && !sh.__codexRtlObserved) {
      try {
        sh.__codexRtlObserved = 1;
        scanRoot(sh, observe);
        if (typeof observe === 'function') {
          observe(sh);
        }
      } catch (err3) {
      }
    }
  }
}

function scanRoot(root, observe) {
  if (typeof document === 'undefined' || !root) {
    return;
  }
  var walker = document.createTreeWalker(root, 4, null);
  var node = walker.nextNode();
  while (node) {
    var parent = node.parentElement;
    if (parent && processTextNode(node.nodeValue || '', parent) === 'rtl') {
      var block = findBlock(parent);
      if (isSettableBlock(block)) {
        try {
          block.setAttribute('dir', 'rtl');
        } catch (err) {
        }
      }
    }
    node = walker.nextNode();
  }
  scanShadows(root, observe);
}

function handleInput(ev) {
  var t = ev && ev.target;
  if (!t || t.nodeType !== 1) {
    return;
  }
  var tag = String(t.tagName || '').toUpperCase();
  var editable = tag === 'TEXTAREA' || t.isContentEditable === true || (tag === 'INPUT' && /^(text|search)$/i.test(t.type || ''));
  if (editable) {
    t.setAttribute('dir', detectDir(t.value !== undefined ? t.value : t.textContent));
  }
}

(function startCodexRtl() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  var pending = [];
  var timer = null;
  function queue(root) {
    if (pending.length >= CODEX_RTL_MAX_ROOTS) {
      return;
    }
    pending.push(root);
    if (timer === null) {
      timer = setTimeout(flush, CODEX_RTL_BATCH_MS);
    }
  }
  document.addEventListener('input', handleInput, true);
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) {
          queue(added[j]);
        }
      }
    }
  });
  function observeShadowRoot(sh) {
    try {
      observer.observe(sh, { childList: true, subtree: true });
    } catch (err) {
    }
  }
  function flush() {
    timer = null;
    var roots = pending.slice(0, CODEX_RTL_MAX_ROOTS);
    pending = [];
    for (var i = 0; i < roots.length; i++) {
      scanRoot(roots[i], observeShadowRoot);
    }
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanRoot(document.body, observeShadowRoot);
    });
  } else {
    scanRoot(document.body, observeShadowRoot);
  }
})();
})();
