/* Xiaomi MiMo AI — RTL / Persian patch  (runtime payload)
 * ---------------------------------------------------------------------------
 * v1.1.0
 *
 * GOAL (exactly what the user asked for):
 *   Whenever a sentence / paragraph contains ANY Persian (Arabic-script)
 *   letter, that whole sentence / paragraph is displayed RTL — even when the
 *   sentence starts with Latin characters or punctuation. Those same blocks
 *   also switch to the Vazirmatn font.
 *
 * TARGETS:
 *   1. What the user types     -> the chat composer (textarea.composer-input)
 *                                 and any other editable field.
 *   2. What the model outputs  -> markdown blocks (p, li, h1-h6, blockquote,
 *                                 table cells, ...) plus plain-text leaf blocks.
 *
 * NEVER TOUCHED (must stay LTR + monospace):
 *   pre / code / kbd / samp / tt, the code editor, the terminal, math (KaTeX),
 *   canvases, and anything marked [data-rtl-skip].
 *
 * This file is injected into app.asar (out/renderer/rtl-fa.js) and referenced
 * from out/renderer/index.html. See patch-xiaomi-mimo-rtl.sh.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";
  if (typeof document === "undefined") return;

  var VERSION = "1.1.0";
  var BLOCK_CLASS = "mimo-rtl-fa";
  var INPUT_CLASS = "mimo-rtl-input";
  /* remembers the element's original dir so we can restore it cleanly */
  var PREV_DIR_ATTR = "data-mimo-rtl-prev-dir";

  /* ---------------------------------------------------------------------
   * 1) Persian / Arabic-script detection
   *    - 0600-06FF  Arabic (covers all Persian letters + Persian digits)
   *    - 0750-077F  Arabic Supplement
   *    - 08A0-08FF  Arabic Extended-A
   *    - FB50-FDFF  Arabic Presentation Forms-A (lam-alef ligatures ...)
   *    - FE70-FEFF  Arabic Presentation Forms-B
   *    - 200C/200D  ZWNJ / ZWJ (zero-width joiners inside Persian words)
   * --------------------------------------------------------------------- */
  var FA_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D]/;

  function hasFA(text) {
    return !!text && FA_RE.test(text);
  }

  /* ---------------------------------------------------------------------
   * 2) Selectors
   * --------------------------------------------------------------------- */
  /* Code / math / terminal / editors: never re-directed, always monospace. */
  var SKIP_SELECTOR =
    "pre,code,kbd,samp,tt,var,script,style,noscript,canvas,math," +
    ".monaco-editor,.xterm,.cm-editor,.cm-content,.katex,.katex-display," +
    ".hljs,.shiki,.prismjs,.code-block,.codeblock," +
    "mjx-container,[data-rtl-skip]";

  /* Tags that are always treated as a text block. */
  var BLOCK_TAGS = {
    P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    BLOCKQUOTE: 1, DT: 1, DD: 1, TD: 1, TH: 1, FIGCAPTION: 1,
    SUMMARY: 1, CAPTION: 1, LABEL: 1, LEGEND: 1, ADDRESS: 1, CITE: 1
  };

  /* Generic containers are treated as a text block only when every element
     child is inline — i.e. the container itself owns the sentence. */
  var LEAF_TAGS = {
    DIV: 1, SPAN: 1, SECTION: 1, ARTICLE: 1, ASIDE: 1, HEADER: 1,
    FOOTER: 1, MAIN: 1, NAV: 1, FIGURE: 1, FORM: 1, TIME: 1,
    BDI: 1, BDO: 1, OUTPUT: 1, MARK: 1, SMALL: 1
  };

  var INLINE_TAGS = {
    B: 1, I: 1, U: 1, S: 1, EM: 1, STRONG: 1, SMALL: 1, SUB: 1, SUP: 1,
    MARK: 1, ABBR: 1, A: 1, SPAN: 1, CODE: 1, KBD: 1, SAMP: 1, TT: 1,
    VAR: 1, DFN: 1, Q: 1, CITE: 1, BDI: 1, BDO: 1, TIME: 1, DEL: 1,
    INS: 1, WBR: 1, IMG: 1, BR: 1, HR: 1, SVG: 1, PICTURE: 1, SOURCE: 1,
    RUBY: 1, RT: 1, RP: 1, LINK: 1, LABEL: 1, OUTPUT: 1
  };

  /* Containers that hold controls, not prose: never flip their direction,
     otherwise a toolbar's flex order would visually reverse. */
  var CONTROL_TAGS = { BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, OPTION: 1 };

  var EDITABLE_SELECTOR =
    'textarea,input[type="text"],input[type="search"],input[type="url"],' +
    'input[type="tel"],input[type="email"],input[type="password"],' +
    '[contenteditable="true"],[contenteditable=""]';

  var CHAR_LIMIT = 200000; /* never analyse absurdly large blobs */
  var MAX_BLOCKS = 4000;   /* per full scan */

  /* ---------------------------------------------------------------------
   * 3) Helpers
   * --------------------------------------------------------------------- */
  function isSkipped(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest) {
      try {
        if (el.closest(SKIP_SELECTOR)) return true;
      } catch (e) { /* invalid selector in odd engines: ignore */ }
    }
    return false;
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      return (
        type === "text" || type === "search" || type === "url" ||
        type === "tel" || type === "email" || type === "password"
      );
    }
    return el.isContentEditable === true;
  }

  function editableText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  /* Does this element own a sentence itself (as opposed to wrapping blocks)? */
  function isTextBlock(el) {
    var tag = el.tagName;
    if (BLOCK_TAGS[tag]) return true;
    if (!LEAF_TAGS[tag]) return false;
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var childTag = kids[i].tagName;
      if (CONTROL_TAGS[childTag]) return false;
      if (kids[i].getAttribute && kids[i].getAttribute("role") === "button") return false;
      if (!INLINE_TAGS[childTag]) return false;
    }
    return true;
  }

  function setDirAttr(el, dir, lang) {
    if (el.getAttribute("dir") === dir && el.getAttribute("lang") === lang) return;
    if (!el.hasAttribute(PREV_DIR_ATTR)) {
      el.setAttribute(PREV_DIR_ATTR, el.getAttribute("dir") || "");
    }
    el.setAttribute("dir", dir);
    el.setAttribute("lang", lang);
  }

  function restoreDirAttr(el) {
    if (!el.hasAttribute(PREV_DIR_ATTR)) return;
    var prev = el.getAttribute(PREV_DIR_ATTR) || "";
    el.removeAttribute(PREV_DIR_ATTR);
    if (prev) el.setAttribute("dir", prev);
    else el.removeAttribute("dir");
    if (el.getAttribute("lang") === "fa") el.removeAttribute("lang");
  }

  /* ---------------------------------------------------------------------
   * 4) Block handling  (model output + any prose)
   * --------------------------------------------------------------------- */
  function clearBlock(el) {
    if (!el.classList.contains(BLOCK_CLASS)) return;
    el.classList.remove(BLOCK_CLASS);
    restoreDirAttr(el);
  }

  function markBlock(el) {
    if (!el.classList.contains(BLOCK_CLASS)) el.classList.add(BLOCK_CLASS);
    setDirAttr(el, "rtl", "fa");
  }

  function processBlock(el) {
    if (!el || el.nodeType !== 1) return;
    if (!isTextBlock(el)) return;
    if (isSkipped(el)) return;
    if (isEditable(el)) return; /* handled by processEditable */

    var text = el.textContent || "";
    if (!text) {
      clearBlock(el);
      return;
    }
    if (text.length > CHAR_LIMIT) return;

    if (hasFA(text)) {
      markBlock(el);
      /* keep the surrounding list in the same direction so bullets /
         numbering land on the right side too */
      var parent = el.parentElement;
      if (parent && el.tagName === "LI" &&
          (parent.tagName === "UL" || parent.tagName === "OL")) {
        markBlock(parent);
      }
    } else {
      clearBlock(el);
    }
  }

  /* ---------------------------------------------------------------------
   * 5) Editable handling  (what the user types)
   * --------------------------------------------------------------------- */
  function processEditable(el) {
    if (!el || el.nodeType !== 1) return;
    if (!isEditable(el)) return;
    if (el.closest) {
      try {
        if (el.closest(".monaco-editor,.cm-editor,.xterm")) return;
      } catch (e) { /* ignore */ }
    }

    if (hasFA(editableText(el))) {
      if (!el.classList.contains(INPUT_CLASS)) el.classList.add(INPUT_CLASS);
      setDirAttr(el, "rtl", "fa");
    } else if (el.classList.contains(INPUT_CLASS)) {
      el.classList.remove(INPUT_CLASS);
      restoreDirAttr(el);
    }
  }

  /* ---------------------------------------------------------------------
   * 6) Scanning
   * --------------------------------------------------------------------- */
  var BLOCK_QUERY =
    "p,li,h1,h2,h3,h4,h5,h6,blockquote,dt,dd,td,th,figcaption,summary," +
    "caption,label,legend,address,div,span,section,article,aside,header," +
    "footer,main,nav,figure,form,output";

  function processSubtree(root) {
    if (!root || root.nodeType !== 1) return;
    var nodes;
    try {
      nodes = root.querySelectorAll(BLOCK_QUERY);
    } catch (e) {
      nodes = [];
    }
    var limit = nodes.length > MAX_BLOCKS ? MAX_BLOCKS : nodes.length;
    for (var i = 0; i < limit; i++) processBlock(nodes[i]);
    processBlock(root);
  }

  function scanAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes, inputs, i;
    try {
      nodes = scope.querySelectorAll(BLOCK_QUERY);
    } catch (e) {
      nodes = [];
    }
    var limit = nodes.length > MAX_BLOCKS ? MAX_BLOCKS : nodes.length;
    /* newest content matters most: walk from the end first */
    for (i = limit - 1; i >= 0; i--) processBlock(nodes[i]);

    try {
      inputs = scope.querySelectorAll(EDITABLE_SELECTOR);
    } catch (e) {
      inputs = [];
    }
    for (i = 0; i < inputs.length; i++) processEditable(inputs[i]);
  }

  /* ---------------------------------------------------------------------
   * 7) Mutation tracking (covers token-by-token streaming)
   * --------------------------------------------------------------------- */
  var scheduled = false;
  var dirty = [];

  function flush() {
    scheduled = false;
    var nodes = dirty;
    dirty = [];
    var i;
    if (nodes.length === 0 || nodes.length > 40) {
      try {
        scanAll(document);
      } catch (e) { /* never let the patch break the app */ }
      return;
    }
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || !node.isConnected) continue;
      try {
        processSubtree(node);
        /* re-check the enclosing block: the new text may have only just
           turned an existing block Persian */
        var owner = node.closest ? node.closest(BLOCK_QUERY) : null;
        if (owner) processBlock(owner);
      } catch (e) { /* ignore */ }
    }
    try {
      var active = document.activeElement;
      if (active && isEditable(active)) processEditable(active);
    } catch (e) { /* ignore */ }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    /* NOTE: the sweep must be on a plain timer. rAF does NOT fire while the
       window is hidden/minimised (visibilityState=hidden) and stops entirely
       during token-by-token streaming renders in some Electron builds — then
       Persian blocks would never be re-directed. 16fps (60ms) is cheap because
       flush() only touches the newest dirty batch. */
    setTimeout(flush, 60);
  }

  /* ---------------------------------------------------------------------
   * 8) Wiring
   * --------------------------------------------------------------------- */
  function onInput(event) {
    var target = event.target;
    if (!target || target.nodeType !== 1) return;
    var editable = null;
    if (isEditable(target)) editable = target;
    else if (target.closest) {
      try {
        editable = target.closest(EDITABLE_SELECTOR);
      } catch (e) { /* ignore */ }
    }
    if (editable) processEditable(editable);
    schedule();
  }

  function onFocusIn(event) {
    var target = event.target;
    if (target && target.nodeType === 1 && isEditable(target)) processEditable(target);
  }

  function start() {
    scanAll(document);

    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onFocusIn, true);

    if (typeof MutationObserver === "undefined") {
      setInterval(function () {
        try {
          scanAll(document);
        } catch (e) { /* ignore */ }
      }, 2000);
      return;
    }

    var observer = new MutationObserver(function (records) {
      var i, j, record, added;
      for (i = 0; i < records.length; i++) {
        record = records[i];
        if (record.type === "characterData") {
          var parent = record.target && record.target.parentElement;
          if (parent) dirty.push(parent);
        } else if (record.type === "childList") {
          for (j = 0; j < record.addedNodes.length; j++) {
            added = record.addedNodes[j];
            if (added.nodeType === 1) dirty.push(added);
            else if (added.nodeType === 3 && added.parentElement) dirty.push(added.parentElement);
          }
        }
      }
      if (dirty.length) schedule();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    /* safety net: catch what the observer may have missed (virtualised lists,
       popovers appended before the observer attached, lazy re-renders, ...) */
    setInterval(function () {
      try {
        scanAll(document);
      } catch (e) { /* ignore */ }
    }, 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.__mimoRTL = {
    version: VERSION,
    rescan: function () {
      try {
        scanAll(document);
      } catch (e) { /* ignore */ }
    }
  };

  try {
    console.log("[mimo-rtl] active v" + VERSION);
  } catch (e) { /* ignore */ }
})();
