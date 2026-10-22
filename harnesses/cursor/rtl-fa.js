/* Cursor-RTL patch v1.0.1
 * Cursor 3.26.x (Electron/VS Code workbench)
 *
 * قانون: هر پاراگراف/آیتم/تیتر/بلوک نقل‌قول/سلول جدولی که حتی یک حرف
 * فارسی داشته باشد، کامل RTL + فونت وزیرمتن می‌شود؛ حتی اگر با انگلیسی،
 * عدد یا علائم شروع شده باشد. متن کاملاً انگلیسی LTR می‌ماند.
 *
 * استثناها: بلاک کد (pre)، کد inline، Monaco، ترمینال، فرمول و فایل‌های کد
 * همیشه LTR و monospace می‌مانند.
 *
 * سطوح خواندنی (چت/ایجنت/پیش‌نمایش): علامت روی خود بلوک.
 * سطوح قابل‌ویرایش (ورودی ProseMirror و textarea): چون ادیتور نودهای داخلی
 * را بازسازی می‌کند، علامت روی کانتینر پایدار می‌نشیند و CSS جهت را آبشاری
 * به پاراگراف‌ها می‌دهد.
 *
 * دامنه: محتوای چت/ایجنت (.markdown-root)، حباب کاربر، ورودی ProseMirror و
 * پیش‌نمایش/ادیتور Markdown. منو، سایدبار و تنظیمات دست‌نخورده می‌مانند.
 */
(function () {
  "use strict";

  var VERSION = "1.0.1";
  var CLASS = "cursor-rtl-fa";
  var INPUT_CLASS = "cursor-rtl-input";
  var FA_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFE]/;

  function hasFA(value) {
    return typeof value === "string" && FA_RE.test(value);
  }

  // ---- دامنه‌های محتوایی؛ UI عمومی عمداً داخل این لیست نیست ----
  var CONTENT_ROOT_SEL = [
    ".markdown-root",
    ".markdown-body",
    ".chat-bubble",
    ".chat-response",
    ".chat-container",
    ".composer-human-message-container",
    "[data-chat-message-text]",
    "[data-message-kind]",
    ".ProseMirror",
    ".markdown-editor-react__richtext-content",
  ].join(",");

  // ---- کانتینرهای ورودی: علامت روی خود کانتینر پایدار ----
  // (ProseMirror نودهای داخلی را بازسازی می‌کند؛ textarea پایدار است)
  var INPUT_CONTAINER_SEL = [
    ".ProseMirror",
    ".agent-prompt-input-root",
    ".composer-human-message-container",
    ".chat-composer",
    "[data-chat-composer]",
    ".markdown-editor-react__richtext-content",
    "textarea",
  ].join(",");

  // ---- چیزهایی که هرگز RTL نمی‌شوند ----
  var CODE_SEL = [
    ".monaco-editor",
    ".view-lines",
    ".xterm",
    ".terminal",
    "canvas",
    ".chat-code-block",
    ".chat-code-block-header",
    ".markdown-code-block",
    "[data-markdown-code-block]",
  ].join(",");
  var BLOCK_CODE_SEL = [
    "pre",
    ".chat-code-block",
    ".markdown-code-block",
    "[data-markdown-code-block]",
  ].join(",");
  var INLINE_CODE_SEL = "code, kbd, samp, tt";
  var BLOCK_TAGS = {
    P: 1,
    LI: 1,
    H1: 1,
    H2: 1,
    H3: 1,
    H4: 1,
    H5: 1,
    H6: 1,
    BLOCKQUOTE: 1,
    TD: 1,
    TH: 1,
    DT: 1,
    DD: 1,
    DIV: 1,
    SECTION: 1,
    ARTICLE: 1,
  };

  var MAX_ROOTS = 800;
  var MAX_TEXT_NODES = 6000;

  function closest(el, selector) {
    try {
      return el && el.closest ? el.closest(selector) : null;
    } catch (e) {
      return null;
    }
  }

  function contentRoot(el) {
    return closest(el, CONTENT_ROOT_SEL);
  }

  function isCodeSurface(el) {
    return !!closest(el, CODE_SEL);
  }

  function isBlockCode(el) {
    return !!closest(el, BLOCK_CODE_SEL);
  }

  function isEligible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isCodeSurface(el)) return false;
    if (isBlockCode(el)) return false;
    // داخل ورودی‌ها بلوک داخلی علامت نمی‌خورد؛ کانتینر جدا مدیریت می‌شود.
    if (closest(el, INPUT_CONTAINER_SEL)) return false;
    return !!contentRoot(el);
  }

  function setRTL(el, cls) {
    if (!el || el.nodeType !== 1) return;
    var mark = cls || CLASS;

    if (!el.classList.contains(mark)) el.classList.add(mark);

    if (!el.hasAttribute("data-cursor-rtl-dir")) {
      el.setAttribute("data-cursor-rtl-dir", el.getAttribute("dir") || "");
    }
    if (el.getAttribute("dir") !== "rtl") el.setAttribute("dir", "rtl");

    if (!el.hasAttribute("data-cursor-rtl-lang")) {
      el.setAttribute("data-cursor-rtl-lang", el.getAttribute("lang") || "");
    }
    if (el.getAttribute("lang") !== "fa") el.setAttribute("lang", "fa");
  }

  function restoreAttr(el, dataKey, attr) {
    var original = el.getAttribute(dataKey);
    if (original === null) return;
    if (original) el.setAttribute(attr, original);
    else el.removeAttribute(attr);
    el.removeAttribute(dataKey);
  }

  function clearRTL(el, cls) {
    if (!el || el.nodeType !== 1) return;
    var mark = cls || CLASS;
    if (el.classList.contains(mark)) el.classList.remove(mark);
    restoreAttr(el, "data-cursor-rtl-dir", "dir");
    restoreAttr(el, "data-cursor-rtl-lang", "lang");
  }

  function inputText(container) {
    if (!container || container.nodeType !== 1) return "";
    try {
      if (container.tagName === "TEXTAREA" || container.tagName === "INPUT") {
        return container.value || "";
      }
      return container.innerText || container.textContent || "";
    } catch (e) {
      return "";
    }
  }

  // ورودی‌ها: اگر کل متن فارسی داشت، خود کانتینر پایدار RTL می‌شود؛
  // در غیر این صورت به حالت اول برمی‌گردد (انگلیسی خالص LTR می‌ماند).
  function processInputContainer(container) {
    if (!container || container.nodeType !== 1 || !container.isConnected) return;
    if (isCodeSurface(container) || isBlockCode(container)) return;
    var t = inputText(container);
    if (t && t.length > 20000) t = t.slice(0, 20000);
    if (hasFA(t)) setRTL(container, INPUT_CLASS);
    else clearRTL(container, INPUT_CLASS);
  }

  function scanInputs() {
    var containers;
    try {
      containers = document.querySelectorAll(INPUT_CONTAINER_SEL);
    } catch (e) {
      return;
    }
    var limit = containers.length > MAX_ROOTS ? MAX_ROOTS : containers.length;
    for (var i = 0; i < limit; i++) processInputContainer(containers[i]);
  }

  // نزدیک‌ترین بلوک متنی را پیدا می‌کند؛ کد inline را رد می‌کند تا
  // پاراگرافِ حاویِ کد فارسی هم RTL شود، ولی خود code همیشه LTR بماند.
  function blockFor(node, root) {
    var el = node && node.parentElement;
    if (!el) return null;
    if (isBlockCode(el) || isCodeSurface(el)) return null;

    while (el && el !== root) {
      if (isBlockCode(el) || isCodeSurface(el)) return null;
      if (BLOCK_TAGS[el.tagName] && !closest(el, INLINE_CODE_SEL)) return el;
      el = el.parentElement;
    }

    if (root && BLOCK_TAGS[root.tagName] && !closest(root, INLINE_CODE_SEL)) {
      return root;
    }
    return root || null;
  }

  function scanRoot(root, seen) {
    if (!root || root.nodeType !== 1 || !root.isConnected) return;
    if (isBlockCode(root) || isCodeSurface(root)) return;

    var walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue || !hasFA(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    } catch (e) {
      return;
    }

    var count = 0;
    var node;
    while (count < MAX_TEXT_NODES && (node = walker.nextNode())) {
      if (seen.has(node)) continue;
      seen.add(node);
      count++;

      var block = blockFor(node, root);
      if (block && isEligible(block)) setRTL(block);
    }
  }

  function cleanup() {
    var marked;
    try {
      marked = document.querySelectorAll("." + CLASS);
    } catch (e) {
      return;
    }
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      if (!el.isConnected) continue;
      if (!isEligible(el) || !hasFA(el.textContent || "")) clearRTL(el);
    }
    var markedInputs;
    try {
      markedInputs = document.querySelectorAll("." + INPUT_CLASS);
    } catch (e) {
      return;
    }
    for (var j = 0; j < markedInputs.length; j++) {
      var inp = markedInputs[j];
      if (!inp.isConnected) continue;
      if (!hasFA(inputText(inp))) clearRTL(inp, INPUT_CLASS);
    }
  }

  function scan() {
    cleanup();
    scanInputs();

    var roots;
    try {
      roots = document.querySelectorAll(CONTENT_ROOT_SEL);
    } catch (e) {
      return;
    }

    var seen = new Set();
    var limit = roots.length > MAX_ROOTS ? MAX_ROOTS : roots.length;
    for (var i = 0; i < limit; i++) {
      scanRoot(roots[i], seen);
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      pending = false;
      try {
        scan();
      } catch (e) {}
    };
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    } catch (e) {}
    setTimeout(run, 60);
  }

  function startLoop(delay) {
    try {
      scan();
    } catch (e) {}
    setTimeout(function loop() {
      try {
        scan();
      } catch (e) {}
      setTimeout(loop, delay);
    }, delay);
  }

  function start() {
    try {
      scan();
    } catch (e) {}

    try {
      if (typeof MutationObserver !== "undefined") {
        var mo = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            // تغییر class/dir خودمان نباید حلقه ایجاد کند.
            if (m.type === "attributes") continue;
            schedule();
            return;
          }
        });
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: false,
        });
      }
    } catch (e) {}

    startLoop(2000);

    document.addEventListener(
      "input",
      function (e) {
        // پاسخ فوری هنگام تایپ: کانتینر ورودی همان لحظه بررسی می‌شود.
        try {
          var t = e && e.target;
          if (t && t.nodeType === 1 && t.closest) {
            var holder = t.closest(INPUT_CONTAINER_SEL);
            if (holder) processInputContainer(holder);
          }
        } catch (err) {}
        schedule();
      },
      true,
    );

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }

    window.__cursorRTL = {
      version: VERSION,
      hasFA: hasFA,
      rescan: scan,
    };

    try {
      console.log("[cursor-rtl] active v" + VERSION);
    } catch (e) {}
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { hasFA: hasFA };
  }
})();
