/*! ============================================================
 * WorkBuddy RTL patch v1.5.0 — workbuddy-rtl.js
 * قانون ۱: هر پاراگراف/جمله‌ای که حتی یک کاراکتر فارسی داشته باشد
 *   (حتی اگر با حروف انگلیسی یا علائم شروع شده باشد)، کل آن RTL است.
 * قانون ۲: پاراگراف/ورودی کاملاً انگلیسی همیشه LTR می‌ماند —
 *   حتی اگر خواهر یا جد آن فارسی باشد (ریست صریح wb-ltr).
 *   این شامل اسپن/اینلاین انگلیسی زیر جد فارسی هم می‌شود.
 * قانون ۳: کانتینرهای ساختاری هرگز mark نمی‌شوند (فقط بلاک برگی).
 * قانون ۴ (ورودی‌ها): جهت ورودی با هر keystroke از روی محتوا تعیین
 *   می‌شود: فارسی→RTL، وگرنه LTR.
 * نکته پیاده‌سازی: mark صرفاً با کلاس CSS است (بدون اتریبیوت dir)،
 *   چون سانی‌تایزر ادیتور و بازنویسی React اتریبیوت را حذف می‌کنند ولی
 *   کلاس را نگه می‌دارند.
 * نکته regex: بازه U+FEFF (BOM/zero-width no-break space) عمداً خارج
 *   است (‎FE70–FEFE‎)؛ وگرنه متن انگلیسی حاوی BOM اشتباهاً RTL می‌شد.
 * نکته iframe: همین فایل در سند مهمان markdown-shared-guest.html هم
 *   تزریق می‌شود تا پیش‌نمایش فایل‌های باز هم RTL شود (هر سند window
 *   جداگانه، همین منطق).
 * نکته پایداری: فقط childList/characterData رصد می‌شود — نوشتن‌های
 *   خودمان هیچ‌کدام از این‌ها را تولید نمی‌کنند، پس همگرایی تضمینی
 *   است و حلقه بازخورد با رندر اپ ممکن نیست. (رصد اتریبیوت class در
 *   v1.2 با بازنویسی‌های مداوم React پینگ‌پنگ و هنگ رندرر می‌ساخت.)
 * استثنا: بلاک‌های کد/ترمینال/ریاضی همیشه LTR می‌مانند.
 * ============================================================ */
(function () {
  'use strict';

  if (window.__wbRtlPatched) return;
  window.__wbRtlPatched = true;

  /* عبری + عربی/فارسی + مکمل‌ها + فرم‌های نمایشی */
  /* Hebrew + Arabic/Persian + supplements + presentation forms (U+FEFF excluded) */
  var RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFE]/;
  /* NOTE: FE70-FEFE, not FEFF: U+FEFF is the BOM/ZWNBSP seen in English
     placeholder text; counting it as Persian marked pure-English
     paragraphs RTL (v1.4.0 root-cause fix). */

  /* تگ‌هایی که هرگز ارزیابی نمی‌شوند */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SLOT: 1,
    TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
    SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1
  };

  /* بلاک‌های متنی (پاراگراف واقعی) */
  var TEXTUAL = 'P,LI,H1,H2,H3,H4,H5,H6,TD,TH,BLOCKQUOTE,DT,DD,LABEL,BUTTON,OUTPUT,FIGCAPTION,CAPTION,LEGEND,ADDRESS,SUMMARY';
  /* همه نامزدهای ارزیابی: متنی + DIV برگی + تگ‌های کد (برای LTR صریح) */
  var EVAL_SEL = TEXTUAL + ',DIV,PRE,CODE,KBD,SAMP,TT';
  /* اینلاین‌ها: فقط برای ریست LTR زیر جد فارسی (قانون ۲)؛ وگرنه وراثت کافی است */
  var INLINE_SEL = 'SPAN,A,STRONG,EM,B,I,U,S,SMALL,BIG,SUB,SUP,MARK,DEL,INS,Q,CITE,DFN,ABBR,TIME,VAR';
  /* اگر DIV یکی از این‌ها را در خود داشته باشد، کانتینر ساختاری است
     (دکمه/لیبل‌ها خودشان جدا ارزیابی می‌شوند) */
  var CONTAINER_SEL = 'DIV,P,LI,UL,OL,DL,TABLE,H1,H2,H3,H4,H5,H6,BLOCKQUOTE,PRE,SECTION,ARTICLE,HEADER,FOOTER,MAIN,ASIDE,NAV,FORM,FIGURE,FIELDSET,DETAILS,BUTTON,LABEL,OUTPUT';
  /* محیط‌های کد/ترمینال/ریاضی */
  var CODE_SEL = 'PRE,CODE,KBD,SAMP,TT,.monaco-editor,.cm-editor,.katex,.xterm';
  var CODE_TAG = { PRE: 1, CODE: 1, KBD: 1, SAMP: 1, TT: 1 };
  var EDITABLE_SEL = '[contenteditable]:not([contenteditable="false"])';

  function addCls(el, c) {
    try {
      if (!el.classList.contains(c)) el.classList.add(c);
    } catch (e) { /* ignore */ }
  }

  function delCls(el, c) {
    try {
      if (el.classList.contains(c)) el.classList.remove(c);
    } catch (e) { /* ignore */ }
  }

  /* فقط کلاس؛ بدون اتریبیوت dir (در برابر سانی‌تایزر/بازنویسی مقاوم) */
  function setRtl(el) {
    delCls(el, 'wb-ltr');
    addCls(el, 'wb-rtl');
  }

  function setLtr(el) {
    delCls(el, 'wb-rtl');
    addCls(el, 'wb-ltr');
  }

  function clearMine(el) {
    try {
      if (el.classList.contains('wb-rtl') || el.classList.contains('wb-ltr')) {
        el.classList.remove('wb-rtl');
        el.classList.remove('wb-ltr');
      }
    } catch (e) { /* ignore */ }
  }

  function inCode(el) {
    try {
      return !!(el.closest && el.closest(CODE_SEL));
    } catch (e) {
      return false;
    }
  }

  /* آیا بلاک، خارج از محیط کد، متنی با کاراکتر فارسی دارد؟ */
  function hasPersian(el) {
    var walker;
    try {
      walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    } catch (e) {
      return false;
    }
    var t;
    while ((t = walker.nextNode())) {
      var v = t.nodeValue;
      if (v && RTL_RE.test(v)) {
        var p = t.parentElement;
        if (p && p.closest && p.closest(CODE_SEL)) continue;
        return true;
      }
    }
    return false;
  }

  function evalBlock(B) {
    if (!B || B.nodeType !== 1) return;
    var tag = B.tagName;
    if (!tag || SKIP_TAGS[tag]) return;
    if (CODE_TAG[tag]) { setLtr(B); return; } /* تگ کد: LTR صریح */
    if (inCode(B)) return; /* داخل کد/موناکو/فرمول: دست نزن */
    /* داخل ادیتور: فقط خودِ ادیتور جهت می‌گیرد (توسط fixInput)؛ بلاک‌های
       داخلی علامت نمی‌خورند تا یک اجرای دوجهته واحد بماند و ترتیب
       کلمات مختلط به‌هم نریزد (ادیتور خودش dir را مدیریت می‌کند). */
    if (inManagedEditable(B)) { clearMine(B); return; }
    /* DIV دارای فرزند بلاکی/فرم = کانتینر ساختاری → رد شو */
    if (tag === 'DIV') {
      try {
        if (B.querySelector(CONTAINER_SEL)) return;
      } catch (e) { /* ignore */ }
    }
    if (hasPersian(B)) setRtl(B);
    else if (B.closest && B.closest('.wb-rtl')) setLtr(B);
    else clearMine(B);
  }

  /* آیا گره داخل یک ادیتور قابل‌ویرایش مدیریت‌شده است؟ */
  function inManagedEditable(el) {
    try {
      var ed = el.closest ? el.closest(EDITABLE_SEL) : null;
      return !!ed;
    } catch (e) {
      return false;
    }
  }

  /* اینلاین زیر جد فارسی: انگلیسی خالص → LTR صریح؛ فارسی → RTL صریح؛
     وگرنه پاک‌سازی تا mark کهنه نماند.
     استثنای حیاتی: داخل ادیتور قابل‌ویرایش هیچ گره درون‌خطی علامت نمی‌خورد.
     دلیل: هر direction مستقل یک «اجرای دوجهته» جدا می‌سازد و مرورگر
     ترتیب کلمات جمله مختلط (فارسی+انگلیسی) را به‌هم می‌ریزد. جهت باید
     فقط در سطح بلاک/ادیتور اعمال شود تا یک اجرای واحد بماند. */
  function evalInline(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName;
    if (!tag || SKIP_TAGS[tag]) return;
    if (inCode(el)) return;
    if (inManagedEditable(el)) { clearMine(el); return; }
    if (hasPersian(el)) setRtl(el);
    else if (el.closest && el.closest('.wb-rtl')) setLtr(el);
    else clearMine(el);
  }

  function isBlockTag(tag) {
    return tag === 'DIV' || CODE_TAG[tag] ||
      (',' + TEXTUAL + ',').indexOf(',' + tag + ',') !== -1;
  }

  function isEditable(el) {
    try {
      if (el.isContentEditable) return true;
      if (el.getAttribute) {
        var v = el.getAttribute('contenteditable');
        return v !== null && v !== 'false';
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /* متن قابل‌تست ورودی: مقدار + placeholder (خالی→LTR مگر placeholder فارسی) */
  function inputText(el) {
    try {
      var tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') {
        return (el.value || '') + '\n' + (el.placeholder || '');
      }
      if (tag === 'INPUT') {
        var type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden' || type === 'checkbox' || type === 'radio' ||
            type === 'submit' || type === 'button' || type === 'image' ||
            type === 'range' || type === 'color' || type === 'file') return null;
        return (el.value || '') + '\n' + (el.placeholder || '');
      }
      if (el.isContentEditable || isEditable(el)) return el.textContent || '';
    } catch (e) { /* ignore */ }
    return null;
  }

  function fixInput(el) {
    if (!el || el.nodeType !== 1) return;
    var t = inputText(el);
    if (t === null) return;
    if (RTL_RE.test(t)) setRtl(el);
    else setLtr(el);
  }

  function scanInputs(root) {
    var list;
    try {
      list = root.querySelectorAll('textarea,input,select,' + EDITABLE_SEL);
    } catch (e) {
      return;
    }
    for (var i = 0; i < list.length; i++) fixInput(list[i]);
  }

  function evalSubtree(root) {
    if (!root || root.nodeType !== 1) return;
    var tag = root.tagName;
    if (!tag || SKIP_TAGS[tag]) return;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT') {
      fixInput(root);
      return;
    }
    if (root.isContentEditable || isEditable(root)) fixInput(root);
    if (isBlockTag(tag)) evalBlock(root);
    else if ((',' + INLINE_SEL + ',').indexOf(',' + tag + ',') !== -1) evalInline(root);
    var list;
    try {
      list = root.querySelectorAll(EVAL_SEL);
    } catch (e) {
      list = [];
    }
    for (var i = 0; i < list.length; i++) evalBlock(list[i]);
    var inlines;
    try {
      inlines = root.querySelectorAll(INLINE_SEL);
    } catch (e) {
      inlines = [];
    }
    for (var k = 0; k < inlines.length; k++) evalInline(inlines[k]);
    scanInputs(root);
  }

  function fullScan() {
    if (document.body) evalSubtree(document.body);
  }

  /* ورودی‌ها: با هر keystroke جهت را از روی محتوا به‌روز کن */
  function onInput(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var tag = t.tagName;
    if (!tag) return;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT') {
      fixInput(t);
      return;
    }
    var ed = null;
    try {
      ed = t.closest ? t.closest(EDITABLE_SEL) : null;
    } catch (err) { /* ignore */ }
    if (ed) fixInput(ed);
    else if (t.isContentEditable || isEditable(t)) fixInput(t);
  }

  var pending = [];
  var scheduled = false;
  var stats = window.__wbRtlStats = { flushes: 0, queued: 0, maxBatch: 0, evals: 0, slowFlush: 0, lastFlushMs: 0, chars: 0, adds: 0 };

  function flush() {
    scheduled = false;
    var batch = pending;
    pending = [];
    stats.flushes++;
    stats.queued += batch.length;
    if (batch.length > stats.maxBatch) stats.maxBatch = batch.length;
    var t0 = Date.now();
    /* طوفان mutation: به یک اسکن کامل فروبکاه (کران‌دار) */
    if (batch.length > 500) {
      try {
        fullScan();
      } catch (e) { /* ignore */ }
      return;
    }
    var roots = [];
    for (var i = 0; i < batch.length; i++) {
      var n = batch[i];
      if (!n) continue;
      if (n.nodeType === 3) n = n.parentElement;
      if (!n || n.nodeType !== 1) continue;
      /* ریشه سطح سند: همان اسکن کامل کافی است */
      if (n.tagName === 'HTML' || n.tagName === 'BODY') {
        try {
          fullScan();
        } catch (e) { /* ignore */ }
        return;
      }
      roots.push(n);
    }
    /* ریشه‌های محصور در ریشه بزرگ‌تر را حذف کن */
    for (var a = 0; a < roots.length; a++) {
      var keep = true;
      for (var b = 0; b < roots.length; b++) {
        if (a !== b && roots[b].contains && roots[b] !== roots[a] &&
            roots[b].contains(roots[a])) {
          keep = false;
          break;
        }
      }
      if (keep) {
        try {
          evalSubtree(roots[a]);
          stats.evals++;
        } catch (e) { /* ignore */ }
      }
    }
    var dt = Date.now() - t0;
    stats.lastFlushMs = dt;
    if (dt > 200) stats.slowFlush++;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(flush);
    else setTimeout(flush, 0);
  }

  function startObserver() {
    var target = document.documentElement || document;
    if (!target || !window.MutationObserver) return;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          stats.chars++;
          pending.push(m.target);
        } else if (m.addedNodes) {
          stats.adds += m.addedNodes.length;
          for (var j = 0; j < m.addedNodes.length; j++) pending.push(m.addedNodes[j]);
          /* حذف فرزند: والد را بازبینی کن تا mark کهنه پاک شود */
          if (m.removedNodes && m.removedNodes.length) pending.push(m.target);
        }
      }
      if (pending.length) schedule();
    });
    try {
      /* فقط childList/characterData: نوشتن‌های خودمان (کلاس) هیچ‌کدام را
         تولید نمی‌کند، پس حلقه بازخورد ناممکن است. */
      mo.observe(target, { childList: true, characterData: true, subtree: true });
    } catch (e) { /* ignore */ }
    try {
      document.addEventListener('input', onInput, true);
    } catch (e2) { /* ignore */ }
  }

  /* اسکریپت با defer اجرا می‌شود: DOM پارس شده، React هنوز mount نشده */
  fullScan();
  startObserver();
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', fullScan);
    window.addEventListener('load', fullScan);
  }
  /* روکش اطمینان برای محتوای دیرهنگام (استریم چت و propهای دیررس) */
  setTimeout(fullScan, 2000);
  setTimeout(fullScan, 8000);
})();
