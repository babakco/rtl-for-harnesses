/* Qoder-RTL patch v3.1
 * Qoder 0.4.2:
 *   - چت: خروجی دستیار (data-chat-message-text / virtualization) + حباب کاربر
 *   - کامپوزر: RichEditor با کلاس .loop-rich-editor
 *   - فایل‌های workspace: تب Preview (data-markdown-file-preview) و تب Source
 *     (data-workspace-source-file-viewer) — هر دو داخل CodeMirror رندر می‌شوند.
 *
 * قانون: هر عنصر/خطی که حتی یک حرف فارسی (۰۶۰۰–۰۶FF و الحقات) داشته باشد
 * => dir=rtl + فونت وزیرمتن، حتی اگر با انگلیسی شروع شده باشد.
 * استثناها: کد (pre/code)، خطوط کد در پیش‌نمایش markdown، ادیتور کد فایل‌های
 * کد، KaTeX، ترمینال.
 *
 * نکتهٔ اجرایی (v3.1): در پنجره‌های مخفی/پس‌زمینه requestAnimationFrame اجرا
 * نمی‌شود، پس زمان‌بند فقط به rAF تکیه نمی‌کند و با setTimeout هم پشتیبانی
 * می‌شود تا بازگردانی کلاس‌ها حداکثر ~۶۰ms طول بکشد.
 */
(function () {
  "use strict";
  var VERSION = "3.2.0";
  var FA_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\u200C\u200D]/;
  function hasFA(s) {
    return !!s && FA_RE.test(s);
  }

  // ---- ابزار جهت ----
  function setRTL(el, cls) {
    if (!el.classList.contains(cls)) el.classList.add(cls);
    if (el.getAttribute("dir") !== "rtl") el.setAttribute("dir", "rtl");
    if (el.getAttribute("lang") !== "fa") el.setAttribute("lang", "fa");
  }
  function clearRTL(el, cls) {
    if (el.classList.contains(cls)) el.classList.remove(cls);
    if (el.getAttribute("dir") === "rtl") el.removeAttribute("dir");
    if (el.getAttribute("lang") === "fa") el.removeAttribute("lang");
  }

  // آیا داخل «ویجت embed شده» در پیش‌نمایش Markdown فایل workspace هستیم؟
  function inMdPreviewEmbedded(el) {
    return !!(el && el.closest && el.closest("[data-markdown-file-preview] .cm-markdown-embedded"));
  }
  function isCodeEl(el) {
    if (!el || !el.closest) return false;
    if (inMdPreviewEmbedded(el)) {
      // فقط خود code block داخل embed همچنان LTR است
      return !!el.closest("pre, code, kbd, samp, tt");
    }
    return !!el.closest("pre, code, kbd, samp, tt, .monaco-editor, .cm-content, .xterm, canvas, [data-markdown-code-block]");
  }
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
    return !!el.isContentEditable;
  }

  // ---- ۱) بلوک‌های متنی چت ----
  var BLOCK_TAGS = ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "td", "th", "dt", "dd"];
  var BLOCK_SCOPES = [
    ".markdown-body",
    "[data-chat-message-text]",
    "[data-message-kind=\"assistant\"]",
    "[data-message-id]",
    "[data-chat-turn]",
    "[data-markdown-virtual-block]",
    "[data-markdown-virtualized]",
    "#root"
  ];
  var BLOCK_SEL = [];
  BLOCK_SCOPES.forEach(function (scope) {
    BLOCK_TAGS.forEach(function (tag) {
      BLOCK_SEL.push(scope + " " + tag);
    });
  });
  BLOCK_SEL = BLOCK_SEL.join(",");

  var USER_BUBBLE_SEL = [
    "[data-user-message] [data-chat-message-text]",
    "[data-user-bubble] [data-chat-message-text]",
    "[data-message-kind=\"user\"] [data-chat-message-text]"
  ].join(",");

  function processBlock(el) {
    if (!el || el.nodeType !== 1) return;
    if (isCodeEl(el)) return;
    if (isEditable(el)) return;
    var t = el.textContent || "";
    if (!t || t.length > 20000) return;
    if (hasFA(t)) setRTL(el, "qoder-rtl-fa");
    else clearRTL(el, "qoder-rtl-fa");
  }

  function processUserBubble(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest(".monaco-editor, .cm-content")) return;
    var t = el.innerText || el.textContent || "";
    if (!t) {
      clearRTL(el, "qoder-rtl-user");
      clearRTL(el, "qoder-rtl-fa");
      return;
    }
    if (t.length > 20000) return;
    if (hasFA(t)) {
      if (!el.classList.contains("qoder-rtl-fa")) el.classList.add("qoder-rtl-fa");
      if (!el.classList.contains("qoder-rtl-user")) el.classList.add("qoder-rtl-user");
      if (el.getAttribute("dir") !== "rtl") el.setAttribute("dir", "rtl");
      if (el.getAttribute("lang") !== "fa") el.setAttribute("lang", "fa");
    } else {
      clearRTL(el, "qoder-rtl-user");
      clearRTL(el, "qoder-rtl-fa");
    }
  }

  // ---- ۲) فایل‌های workspace ----
  // نکتهٔ کلیدی: محتوای فایل داخل CodeMirror (.cm-content) رندر می‌شود و
  // CodeMirror هر تغییر خارجی در آن DOM را برمی‌گرداند (DOMObserver)، پس
  // کلاس/dir روی تک‌خط‌ها دوام ندارد. راه‌حل: فقط کانتینر React (پایدار)
  // را dir=rtl می‌کنیم و همهٔ قوانین را با CSS روی همان کانتینر می‌گذاریم.
  var WS_VIEW_SEL = "[data-markdown-file-preview], [data-workspace-source-file-viewer]";
  var MAX_DOC_CHARS = 400000;

  // فایل‌های متنی/مستنداتی که RTL می‌شوند؛ فایل‌های کد LTR می‌مانند
  var PROSE_EXT = {
    md: 1, markdown: 1, mdx: 1, txt: 1, text: 1, log: 1, rst: 1,
    adoc: 1, asciidoc: 1, org: 1, csv: 1, tsv: 1, ini: 1, cfg: 1, conf: 1, env: 1
  };
  function fileExt(path) {
    if (!path) return "";
    var slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    var dot = path.lastIndexOf(".");
    if (dot <= slash || dot === path.length - 1) return "";
    return path.slice(dot + 1).toLowerCase();
  }
  function isProsePath(path) {
    // مسیر نامشخص (هدر فایل رندر نشده) => محافظه‌کارانه LTR
    if (!path) return false;
    var ext = fileExt(path);
    if (!ext) return true; // LICENSE / README / فایل بدون پسوند
    return PROSE_EXT[ext] === 1;
  }
  // مسیر فایلِ فعال از هدر نمای workspace
  function activeWorkspacePath() {
    var bc = document.querySelectorAll("[data-workspace-file-breadcrumbs]");
    for (var i = bc.length - 1; i >= 0; i--) {
      if (bc[i].offsetParent === null && bc.length > 1) continue;
      var t = bc[i].getAttribute("title");
      if (t) return t;
    }
    var ex = document.querySelectorAll("[data-external-file-preview-path]");
    for (var j = ex.length - 1; j >= 0; j--) {
      var t2 = ex[j].getAttribute("data-external-file-preview-path");
      if (t2) return t2;
    }
    var nm = document.querySelectorAll("[data-workspace-file-name]");
    if (nm.length) return nm[nm.length - 1].textContent || "";
    return "";
  }
  // متن کامل سند از خود CodeMirror (پنجرهٔ مجازی DOM فقط بخشی از سند را دارد)
  function viewDocText(viewEl) {
    try {
      var cm = viewEl.querySelector(".cm-content");
      var tile = cm && cm.cmTile;
      var view = tile && tile.view;
      if (view && view.state && view.state.doc) {
        var s = view.state.doc.toString();
        if (s) return s.length > MAX_DOC_CHARS ? s.slice(0, MAX_DOC_CHARS) : s;
      }
    } catch (e) {}
    try {
      var c = viewEl.querySelector(".cm-content");
      return c ? c.textContent || "" : "";
    } catch (e2) {
      return "";
    }
  }
  function scanWorkspaceFiles() {
    var views;
    try {
      views = document.querySelectorAll(WS_VIEW_SEL);
    } catch (e) {
      return;
    }
    var path = activeWorkspacePath();
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      // Preview = فایل markdown رندرشده (همیشه prose)
      // Source  = فقط فایل‌های متنی/مستنداتی
      var ok = v.hasAttribute("data-markdown-file-preview") ? true : isProsePath(path);
      if (!ok) {
        clearRTL(v, "qoder-rtl-file");
        continue;
      }
      if (hasFA(viewDocText(v))) setRTL(v, "qoder-rtl-file");
      else clearRTL(v, "qoder-rtl-file");
    }
  }

  // ---- ۳) ورودی کاربر ----
  function editableText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }
  function processInput(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest(".monaco-editor, .cm-content, .xterm")) return;
    var t = editableText(el);
    if (hasFA(t)) {
      if (!el.classList.contains("qoder-rtl-input")) el.classList.add("qoder-rtl-input");
      try {
        el.setAttribute("dir", "rtl");
      } catch (e) {}
    } else {
      if (el.classList.contains("qoder-rtl-input")) {
        el.classList.remove("qoder-rtl-input");
        try {
          el.removeAttribute("dir");
        } catch (e) {}
      }
    }
  }

  var INPUT_SEL = 'textarea, input[type="text"], [contenteditable="true"], .loop-rich-editor';

  function scanAll(root) {
    scanWorkspaceFiles();
    var scope = root && root.querySelectorAll ? root : document;
    var blocks;
    try {
      blocks = scope.querySelectorAll(BLOCK_SEL);
    } catch (e) {
      blocks = [];
    }
    var n = blocks.length;
    var limit = n > 2500 ? 2500 : n;
    for (var i = 0; i < limit; i++) processBlock(blocks[i]);

    var bubbles;
    try {
      bubbles = scope.querySelectorAll(USER_BUBBLE_SEL);
    } catch (e) {
      bubbles = [];
    }
    for (var b = 0; b < bubbles.length; b++) processUserBubble(bubbles[b]);

    if (scope !== document && scope.nodeType === 1 && scope.matches) {
      try {
        if (scope.matches(USER_BUBBLE_SEL)) processUserBubble(scope);
      } catch (e) {}
      try {
        if (scope.matches(INPUT_SEL)) processInput(scope);
      } catch (e) {}
    }

    var inputs;
    try {
      inputs = scope.querySelectorAll(INPUT_SEL);
    } catch (e) {
      inputs = [];
    }
    for (var j = 0; j < inputs.length; j++) {
      var inp = inputs[j];
      if (inp.classList && inp.classList.contains("monaco-mouse-cursor-text")) continue;
      if (inp.getAttribute && inp.getAttribute("type") === "hidden") continue;
      if (inp.getAttribute && inp.getAttribute("contenteditable") === "false") continue;
      if (inp.closest && inp.closest("[data-editor-inline-token]")) continue;
      processInput(inp);
    }
  }

  // ---- زمان‌بند مقاوم ----
  // در پنجرهٔ مخفی rAF اجرا نمی‌شود؛ هر دو مسیر را هم‌زمان ثبت می‌کنیم و
  // هرکدام زودتر اجرا شود کار را انجام می‌دهد و دیگری بی‌اثر می‌ماند.
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
        scanAll(document);
      } catch (e) {}
    };
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    } catch (e) {}
    setTimeout(run, 60);
  }

  function startLoop(delay) {
    try {
      scanAll(document);
    } catch (e) {}
    setTimeout(function loop() {
      try {
        scanAll(document);
      } catch (e) {}
      setTimeout(loop, delay);
    }, delay);
  }

  function start() {
    try {
      scanAll(document);
    } catch (e) {}

    try {
      if (typeof MutationObserver !== "undefined") {
        var mo = new MutationObserver(function (muts) {
          var onlySelf = true;
          for (var i = 0; i < muts.length; i++) {
            var m = muts[i];
            if (m.type !== "attributes" || m.attributeName !== "class") {
              onlySelf = false;
              break;
            }
          }
          if (onlySelf) return;
          schedule();
        });
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: false
        });
      }
    } catch (e) {}

    // حلقهٔ پشتیبان: بعد از هر اجرا دوباره زمان‌بندی می‌شود تا خطای احتمالی
    // آن را از کار نیندازد (برخلاف setInterval).
    startLoop(2000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
  }

  document.addEventListener(
    "input",
    function (e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      try {
        if (t.matches && t.matches(INPUT_SEL)) {
          processInput(t);
        } else if (t.closest) {
          var ed = t.closest(INPUT_SEL);
          if (ed) processInput(ed);
          var bub = t.closest(USER_BUBBLE_SEL);
          if (bub) processUserBubble(bub);
        }
      } catch (err) {}
      schedule();
    },
    true
  );
  document.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(INPUT_SEL)) {
      try {
        processInput(t);
      } catch (err) {}
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.__qoderRTL = {
    version: VERSION,
    rescan: function () {
      scanAll(document);
    }
  };
  try {
    console.log("[qoder-rtl] active v" + VERSION);
  } catch (e) {}
})();