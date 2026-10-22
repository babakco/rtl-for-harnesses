/* ============================================================
 * MiniMax Code-RTL — rtl-autodir.js
 *
 * این فایل یک IIFE خودکفاست و در سه جا اجرا می‌شود:
 *   1) داخل rtl-preload.cjs (به‌صورت inline، در isolated world)
 *   2) به‌صورت فایل مستقل در <script src="…/rtl-autodir.js"> صفحات رندرر
 *   3) به‌عنوان fallback با webContents.executeJavaScript در main process
 *
 * ─────────────────────────────────────────────────────────────
 * قاعدهٔ جهت‌دهی (دقیقاً مطابق نیاز کاربر):
 *   هر پاراگراف / جمله / بلوک متنی که «حتی یک حرف فارسی» داشته باشد
 *   باید RTL نمایش داده شود — فارغ از اینکه با کلمهٔ انگلیسی، عدد،
 *   علامت نگارشی یا هر کاراکتر دیگری شروع شده باشد.
 *
 *   مثال:
 *     "سلام دنیا"                  → rtl
 *     "Hello سلام"                → rtl   (با کلمهٔ انگلیسی شروع شده)
 *     "2024-01-01 گزارش"          → rtl   (با عدد و خط تیره شروع شده)
 *     "(توجه) این مهم است"        → rtl   (با پرانتز شروع شده)
 *     "Hello world"                → ltr
 *     "1234"                       → دست‌نخورده (بدون حرف)
 *
 * این قاعده روی همهٔ محتوای نمایش‌داده‌شده اعمال می‌شود:
 *   • پاسخ‌های مدل (مارک‌داون)
 *   • متن کامپوزر گفت‌وگو (هنگام تایپ)
 *   • گزینه‌ها و توضیحات پرسش‌های چندگزینه‌ای
 *   • فایل‌های بازشده (نمایشگر فایل: ofv-* و نمایشگر کد: code-view-*)
 *   • متن‌های رابط کاربری، منوها، تنظیمات
 * ============================================================ */
(function () {
  "use strict";

  /* ---------- محافظت از اجرای دوباره ----------
     1) پرچم window: جلوگیری از اجرای دوباره در همان world
     2) نشانهٔ DOM: جلوگیری از اجرای هم‌زمانِ نسخهٔ preload (isolated world)
        و نسخهٔ <script src> در صفحه (main world).
        DOM بین worldها مشترک است، پس این نشانه کافی است.
     نشانه باید در همان لحظهٔ اجرا ست شود (نه در boot) تا دو نسخه با هم
     مسابقه ندهند. */
  try {
    var _de = document.documentElement;
    if (_de) {
      if (_de.getAttribute("data-minimax-rtl") === "1") return;
      _de.setAttribute("data-minimax-rtl", "1");
    }
  } catch (e) { /* noop */ }
  if (window.__MINIMAX_RTL_ACTIVE__) return;
  window.__MINIMAX_RTL_ACTIVE__ = true;

  /* ============================================================
   * ۱) الگوهای کاراکتری
   * ============================================================ */
  // حروف/نشانه‌های راست‌به‌چپ: عبری، عربی، عربی توسعه‌یافته، فارسی، فرم‌های نمایشی
  var RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  var LTR_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
  // کاراکترهای کنترلی دوجهته (LRM/RLM/…/LRI…PDI) نادیده گرفته می‌شوند
  var CTRL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

  /* ============================================================
   * ۲) انتخابگرها
   * ============================================================ */

  /** عناصری که هرگز نباید dir بگیرند (کدِ بلوکی، فرمول، نمودار، آیکون، ورودی‌ها) */
  var SKIP_MARK_SEL = [
    "pre",
    ".code-view",                       // نمایشگر کد (کل ظرف)
    ".ofv-code-body", ".ofv-code-container", // نمایشگر فایل کد
    ".katex", "[class*='katex']", ".MathJax", "[class*='math-block']",
    "[class*='mermaid']", "[class*='highlight']",
    "[class*='CodeMirror']", ".cm-editor", ".cm-content",
    "[class*='xterm']", ".xterm", ".terminal",
    "svg", "canvas", "script", "style", "noscript", "iframe", "video", "audio",
    "textarea", "input", "select", "option",
    "[contenteditable]:not([contenteditable='false'])",
    ".minimax-rtl-skip"
  ].join(",");

  /** زیردرخت‌هایی که متنشان در محاسبهٔ متن والد لحاظ نمی‌شود */
  var SKIP_TEXT_SEL = [
    "svg", "canvas", "script", "style", "noscript", "iframe", "video", "audio",
    "pre",                                  // بلوک کد: جداگانه (خط‌به‌خط) رسیدگی می‌شود
    ".katex", "[class*='katex']", ".MathJax",
    "[class*='mermaid']",
    "[class*='xterm']", ".xterm"
  ].join(",");

  /** عناصر «خط کد» — جهت هر خط جداگانه تعیین می‌شود */
  var CODE_LINE_SEL =
    ".code-view-line-body, [class*='code-view-line-body'], .code-line, [class*='code-line']";

  /** بلوک‌های متنِ ساده در نمایشگر فایل — خط‌به‌خط شکسته می‌شوند */
  var LINE_SPLIT_SEL = ".ofv-text-block, [class*='ofv-text-block']";

  /** عناصر بلوکیِ متنی */
  var PLAIN_BLOCK = {
    P: 1, LI: 1, BLOCKQUOTE: 1, TD: 1, TH: 1, DD: 1, DT: 1,
    FIGCAPTION: 1, CAPTION: 1, SUMMARY: 1, LABEL: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  /** کانتینرهای عمومی: فقط وقتی متنِ مستقیم داشته باشند */
  var GENERIC = {
    DIV: 1, SPAN: 1, A: 1, BUTTON: 1, EM: 1, STRONG: 1, B: 1, I: 1, SMALL: 1
  };

  /** انتخابگر نامزدها برای اسکن */
  var CANDIDATE_SEL = [
    "p", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "td", "th", "dd", "dt", "figcaption", "caption", "summary", "label",
    "div", "span", "a", "button", "em", "strong", "b", "i", "small"
  ].join(",");

  /* ============================================================
   * ۳) ابزارها
   * ============================================================ */
  function matches(el, sel) {
    try { return !!(el && el.matches && el.matches(sel)); } catch (e) { return false; }
  }

  function isSkipped(el) {
    try { return !!(el.closest && el.closest(SKIP_MARK_SEL)); } catch (e) { return true; }
  }

  function hasDirectText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.data)) return true;
    }
    return false;
  }

  /** متن عنصر، با صرف‌نظر از زیردرخت‌های مستثنا */
  function textOf(el) {
    var out = "";
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out += c.data; continue; }
        if (c.nodeType !== 1) continue;
        var t = c.tagName;
        if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" ||
            t === "SVG" || t === "CANVAS" || t === "IFRAME") continue;
        if (matches(c, SKIP_TEXT_SEL)) continue;
        walk(c);
      }
    })(el);
    return out;
  }

  /** جهت مطلوب: "rtl" | "ltr" | null */
  function dirOf(text) {
    if (!text) return null;
    var t = text.replace(CTRL_RE, "");
    if (!/\S/.test(t)) return null;
    if (RTL_RE.test(t)) return "rtl";   // ← هر حرف فارسی ⇒ RTL
    if (LTR_RE.test(t)) return "ltr";
    return null;                        // فقط عدد/علائم ⇒ دست‌نخورده
  }

  /* ============================================================
   * ۴) اعمال جهت روی یک عنصر
   * ============================================================ */
  var applied = new WeakMap();

  function apply(el) {
    if (!el || el.nodeType !== 1) return;
    if (matches(el, SKIP_MARK_SEL)) return;

    var tag = el.tagName;
    var isCodeLine = matches(el, CODE_LINE_SEL);
    var isPlain = !!PLAIN_BLOCK[tag];
    var isGeneric = !!GENERIC[tag];

    if (!isPlain && !isGeneric && !isCodeLine) return;
    // کانتینرهای عمومی فقط وقتی متنِ مستقیم دارند (وگرنه کل چیدمان را علامت می‌زنیم)
    if (isGeneric && !isCodeLine && !hasDirectText(el)) return;

    var text = textOf(el);
    if (!text || !/\S/.test(text)) return;

    var d = dirOf(text);
    if (!d) return;

    var currentAttr = el.getAttribute("dir");
    // برای LTR اجازه نمی‌دهیم انتخاب صریح اپ را خراب کنیم؛ فقط وقتی
    // dir به‌صورت ارث‌رسیده (RTL از والد) است، آن را اصلاح می‌کنیم.
    if (d === "ltr" && currentAttr === "ltr") return;
    if (applied.get(el) === d && currentAttr === d) return;

    applied.set(el, d);
    el.setAttribute("dir", d);
    el.classList.add("minimax-rtl-auto");
    if (d === "rtl") el.classList.add("minimax-rtl-rtl");
    else el.classList.remove("minimax-rtl-rtl");
  }

  /* ============================================================
   * ۵) شکستن بلوک متنِ ساده به خط‌ها (نمایشگر فایل)
   *    تا هر خط مستقل جهت بگیرد؛ یک خط فارسی، کل فایل را راست‌چین نکند.
   * ============================================================ */
  function splitTextBlock(el) {
    // فقط وقتی یک گرهٔ متنیِ واحد با چند خط وجود دارد
    var textNode = null;
    var children = 0;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { textNode = n; children++; }
      else if (n.nodeType === 1 && n.tagName === "BR") children++;
      else return;                       // ساختار پیچیده → دست نمی‌زنیم
    }
    if (!textNode) return;
    if (textNode.data.indexOf("\n") < 0) return;

    var lines = textNode.data.split("\n");
    if (lines.length < 2) return;

    var frag = document.createDocumentFragment();
    for (var i = 0; i < lines.length; i++) {
      var span = document.createElement("span");
      span.setAttribute("data-minimax-rtl-line", "");
      span.className = "minimax-rtl-line";
      // display:block خودش هر خط را در سطر جدید می‌گذارد؛
      // اضافه‌کردن <br> باعث فاصلهٔ دوبرابر می‌شد.
      span.style.display = "block";
      span.textContent = lines[i];
      frag.appendChild(span);
    }
    try {
      el.textContent = "";
      el.appendChild(frag);
    } catch (e) { /* ignore */ }
  }

  /* ============================================================
   * ۶) کامپوزر (جایی که کاربر تایپ می‌کند)
   * ============================================================ */
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

  /* ============================================================
   * ۷) اسکن با زمان‌بندی
   * ============================================================ */
  var queue = [];
  var queued = new Set();
  var scheduled = false;

  function flush() {
    scheduled = false;
    var items = queue;
    queue = [];
    queued = new Set();

    var bag = [];
    for (var i = 0; i < items.length; i++) collect(items[i], bag);

    var seen = new Set();
    for (var j = 0; j < bag.length; j++) {
      var el = bag[j];
      if (seen.has(el)) continue;
      seen.add(el);
      apply(el);
    }
  }

  /** جمع‌آوری نامزدها در یک زیردرخت (root هم شامل می‌شود) */
  function collect(root, out) {
    if (!root || root.nodeType !== 1) return;
    if (!isSkipped(root)) {
      apply(root);
      // خطوط کد
      var codeLines = root.querySelectorAll(CODE_LINE_SEL);
      for (var i = 0; i < codeLines.length; i++) out.push(codeLines[i]);
      // بلوک‌های متنِ ساده → خط‌به‌خط
      var textBlocks = root.querySelectorAll(LINE_SPLIT_SEL);
      for (var j = 0; j < textBlocks.length; j++) splitTextBlock(textBlocks[j]);
    }
    // نامزدهای عمومی
    var kids = root.querySelectorAll(CANDIDATE_SEL);
    for (var k = 0; k < kids.length; k++) out.push(kids[k]);
  }

  function schedule(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
    if (!el || queued.has(el)) return;
    queued.add(el);
    queue.push(el);
    if (scheduled) return;
    scheduled = true;
    // عمداً setTimeout و نه requestAnimationFrame:
    // rAF در پنجره‌های مخفی/غیرفعال اجرا نمی‌شود و عقب‌ماندگی می‌سازد.
    setTimeout(flush, 16);
  }

  /* ============================================================
   * ۸) راه‌اندازی
   * ============================================================ */
  function boot() {
    try {
      document.documentElement.classList.add("minimax-rtl-on");
    } catch (e) { /* ignore */ }

    // اسکن کامل اولیه
    var initial = [];
    collect(document.body || document.documentElement, initial);
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
    document.addEventListener("compositionend", function (e) { setTimeout(function () { updateComposer(e.target); }, 0); }, true);

    // اسکن‌های تکمیلی پس از پایان بارگذاری (محتوای دیرهنگام/استریم)
    window.addEventListener("load", function () { schedule(document.documentElement); }, { once: true });
    setTimeout(function () { schedule(document.documentElement); }, 1200);
    setTimeout(function () { schedule(document.documentElement); }, 3000);

    try { updateComposer(document.activeElement); } catch (e) { /* ignore */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
