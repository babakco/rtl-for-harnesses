/* ============================================================
 * Kimi RTL Patch — rtl-autodir.js
 *
 * این فایل به‌صورت یک IIFE خودکفا نوشته شده و در دو جا اجرا می‌شود:
 *   1) داخل rtl-preload.cjs (به‌صورت inline، در isolated world)
 *   2) به‌عنوان fallback با webContents.executeJavaScript(...) در main process
 *
 * قاعدهٔ جهت‌دهی (طبق نیاز کاربر):
 *   هر بلوک متنی که «حتی یک حرف فارسی/عربی» داشته باشد → RTL
 *   حتی اگر جمله با کلمات انگلیسی، اعداد یا علائم آغاز شده باشد.
 *   بلوک‌های بدون هیچ حرف فارسی و دارای حرف لاتین → LTR
 *   بلوک‌های فاقد حرف (فقط عدد/علائم) → دست‌نخورده می‌مانند.
 *
 * استثناها: بلوک‌های کد (pre/code/monaco)، فرمول (KaTeX)، نمودار (mermaid)،
 *           کامپوزر (که جداگانه مدیریت می‌شود) و آیکون‌ها (svg).
 * ============================================================ */
(function () {
  "use strict";

  if (window.__KIMI_RTL_ACTIVE__) return;
  window.__KIMI_RTL_ACTIVE__ = true;

  /* ---------- الگوها ---------- */
  // حروف/نشانه‌های راست‌به‌چپ: عبری، عربی، عربی توسعه‌یافته، فارسی، فرم‌های نمایشی
  var RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  var LTR_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
  // کاراکترهای کنترلی دوجهته (LRM/RLM/…/LRI…PDI) باید نادیده گرفته شوند
  var CTRL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

  /* ---------- استثناها ---------- */
  var EXCLUDE_SEL = [
    "pre", "code", "kbd", "samp", "var", "tt",
    ".monaco-editor", "[class*='monaco']",
    ".katex", "[class*='katex']", ".MathJax", "[class*='math-block']",
    "[class*='mermaid']", "[class*='code-block']", "[class*='highlight']",
    "[class*='CodeMirror']", ".cm-editor", ".cm-content",
    "[contenteditable]:not([contenteditable='false'])",
    "textarea", "input", "select", "option",
    "svg", "canvas", "script", "style", "noscript", "iframe", "video", "audio",
    ".kimi-rtl-skip"
  ].join(",");

  /* ---------- عناصر بلوکیِ متنی ---------- */
  var PLAIN_BLOCK = {
    P: 1, LI: 1, BLOCKQUOTE: 1, TD: 1, TH: 1, DD: 1, DT: 1,
    FIGCAPTION: 1, CAPTION: 1, SUMMARY: 1, LABEL: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };
  // کانتینرهای عمومی فقط وقتی بلوک‌اند که متن مستقیم داشته باشند
  var GENERIC = { DIV: 1, SPAN: 1, A: 1, BUTTON: 1, EM: 1, STRONG: 1, B: 1, I: 1, SMALL: 1 };

  /* ---------- ابزارها ---------- */
  function isSkipped(el) {
    try { return !!(el.closest && el.closest(EXCLUDE_SEL)); } catch (e) { return true; }
  }

  function hasDirectText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.data)) return true;
    }
    return false;
  }

  /** متن عنصر، با صرف‌نظر از زیردرخت‌های مستثنا (کد، فرمول، آیکون…) */
  function textOf(el) {
    var out = "";
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out += c.data; continue; }
        if (c.nodeType !== 1) continue;
        var t = c.tagName;
        if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" || t === "SVG" || t === "CANVAS") continue;
        try { if (c.matches(EXCLUDE_SEL)) continue; } catch (e) { /* ignore */ }
        walk(c);
      }
    })(el);
    return out;
  }

  /** جهت مطلوب برای یک متن: "rtl" | "ltr" | null */
  function dirOf(text) {
    if (!text) return null;
    var t = text.replace(CTRL_RE, "");
    if (RTL_RE.test(t)) return "rtl";   // ← هر حرف فارسی ⇒ RTL
    if (LTR_RE.test(t)) return "ltr";
    return null;
  }

  /* ---------- پردازش یک عنصر ---------- */
  var applied = new WeakMap();   // el -> آخرین جهتی که ست کرده‌ایم

  function apply(el) {
    if (!el || el.nodeType !== 1) return;
    if (isSkipped(el)) return;
    var tag = el.tagName;
    if (!PLAIN_BLOCK[tag] && !GENERIC[tag]) return;
    if (GENERIC[tag] && !hasDirectText(el)) return;

    var text = textOf(el);
    if (!text || !/\S/.test(text)) return;

    var d = dirOf(text);
    if (!d) return;
    if (applied.get(el) === d && el.getAttribute("dir") === d) return;

    applied.set(el, d);
    el.setAttribute("dir", d);
    el.classList.add("kimi-rtl-auto");
  }

  /** جمع‌آوری نامزدها در یک زیردرخت (root هم شامل می‌شود) */
  function scanTree(root, out) {
    if (!root || root.nodeType !== 1) return;
    if (isSkipped(root)) return;
    apply(root);
    var kids = root.querySelectorAll(
      "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,caption,summary,label,div,span,a,button"
    );
    for (var i = 0; i < kids.length; i++) {
      out.push(kids[i]);
    }
  }

  /* ---------- کامپوزر (جایی که کاربر تایپ می‌کند) ---------- */
  function composerOf(target) {
    if (!target || target.nodeType !== 1) return null;
    var t = target.tagName;
    if (t === "TEXTAREA") return target;
    if (t === "INPUT") {
      var ty = (target.getAttribute("type") || "text").toLowerCase();
      if (ty === "text" || ty === "search" || ty === "url" || ty === "email" || ty === "tel" || ty === "") {
        return target;
      }
      return null;
    }
    if (target.isContentEditable) return target;
    try { return target.closest("[contenteditable]:not([contenteditable='false'])"); } catch (e) { return null; }
  }

  function updateComposer(target) {
    var el = composerOf(target);
    if (!el) return;
    var text;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      text = el.value || "";
    } else {
      text = el.innerText || el.textContent || "";
    }
    // متن خالی: دست نمی‌زنیم تا placeholder جهت خودش را نگه دارد
    if (!text || !text.replace(/\s/g, "")) return;
    var d = dirOf(text.replace(CTRL_RE, ""));
    if (!d) return;
    if (el.getAttribute("dir") !== d) el.setAttribute("dir", d);
  }

  /* ---------- اسکن با debounce (rAF) ---------- */
  var queue = [];
  var queued = new Set();
  var scheduled = false;

  function flush() {
    scheduled = false;
    var items = queue;
    queue = [];
    queued = new Set();
    var bag = [];
    for (var i = 0; i < items.length; i++) {
      scanTree(items[i], bag);
    }
    var seen = new Set();
    for (var j = 0; j < bag.length; j++) {
      var el = bag[j];
      if (seen.has(el)) continue;
      seen.add(el);
      apply(el);
    }
  }

  function schedule(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
    if (!el || queued.has(el)) return;
    queued.add(el);
    queue.push(el);
    if (scheduled) return;
    scheduled = true;
    // عمداً setTimeout و نه requestAnimationFrame:
    // rAF در پنجره‌های مخفی/غیرفعال اجرا نمی‌شود و باعث عقب‌ماندگی می‌شود.
    setTimeout(flush, 16);
  }

  /* ---------- راه‌اندازی ---------- */
  function boot() {
    document.documentElement.classList.add("kimi-rtl-on");

    // اسکن کامل اولیه
    var initial = [];
    scanTree(document.body || document.documentElement, initial);
    for (var i = 0; i < initial.length; i++) apply(initial[i]);

    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === "childList") {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType === 1) schedule(n);
            }
          } else if (m.type === "characterData") {
            schedule(m.target);
          }
        }
      }).observe(document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    } catch (e) { /* ignore */ }

    document.addEventListener("input", function (e) { updateComposer(e.target); }, true);
    document.addEventListener("focusin", function (e) { updateComposer(e.target); }, true);
    document.addEventListener("paste", function (e) { setTimeout(function () { updateComposer(e.target); }, 0); }, true);

    // اسکن‌های تکمیلی پس از پایان بارگذاری (محتوای دیرهنگام/استریم)
    window.addEventListener("load", function () { schedule(document.documentElement); }, { once: true });
    setTimeout(function () { schedule(document.documentElement); }, 1200);

    // اگر کامپوزر از قبل متن دارد (مثلاً بعد از reload)، یک بار به‌روزش کن
    try { updateComposer(document.activeElement); } catch (e) { /* ignore */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
