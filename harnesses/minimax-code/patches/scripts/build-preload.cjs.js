#!/usr/bin/env node
/**
 * build-preload.cjs.js — ساخت آرتیفکت‌های رندرر پچ RTL
 *
 * ورودی‌ها :
 *   patches/rtl.css         استایل (ارجاع فونت با مسیر ./fonts)
 *   patches/rtl-autodir.js  منطق تشخیص خودکار جهت
 *   patches/assets/*.woff2  فونت Vazirmatn
 *
 * خروجی‌ها :
 *   patches/rtl-inline.css   rtl.css با فونت‌های تبدیل‌شده به data-URI
 *                             (برای webFrame.insertCSS در preload)
 *   patches/rtl-preload.cjs  قلاب preload به‌صورت CommonJS
 *                             (برای dist/main/preload.js و model-menu-preload.js)
 *
 * اجرا: node patches/scripts/build-preload.cjs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PATCH_ROOT = path.resolve(__dirname, "..");

const cssSource = fs.readFileSync(path.join(PATCH_ROOT, "rtl.css"), "utf8");
const autodirSource = fs.readFileSync(path.join(PATCH_ROOT, "rtl-autodir.js"), "utf8");

/* ---------- تبدیل url("./fonts/X") به data-URI ---------- */
function toDataUri(file) {
  const buf = fs.readFileSync(path.join(PATCH_ROOT, "assets", file));
  return "data:font/woff2;base64," + buf.toString("base64");
}

let inlineCss = cssSource;
const refs = new Set(inlineCss.match(/\.\/fonts\/[A-Za-z0-9._-]+/g) || []);
for (const ref of refs) {
  const file = ref.replace("./fonts/", "");
  const abs = path.join(PATCH_ROOT, "assets", file);
  if (!fs.existsSync(abs)) {
    console.error(`[build] فونت پیدا نشد: ${abs}`);
    process.exit(1);
  }
  inlineCss = inlineCss.split(ref).join(toDataUri(file));
}

const OUT_CSS = path.join(PATCH_ROOT, "rtl-inline.css");
fs.writeFileSync(OUT_CSS, inlineCss);

/* ---------- ساخت قلاب preload ---------- */
const banner = `/* ============================================================
 * MiniMax Code-RTL — rtl-preload.cjs
 * ⚠️ فایل تولیدشده (AUTO-GENERATED) — دستی ویرایش نکنید.
 * منبع     : patches/rtl.css + patches/rtl-autodir.js
 * بازسازی  : node patches/scripts/build-preload.cjs.js
 * ============================================================ */`;

const cssLiteral = JSON.stringify(inlineCss);
const autodirIndented = autodirSource.replace(/^/gm, "  ");

const preload = `${banner}
"use strict";
(function () {
  /* ردیابی اختیاری:  MINIMAX_RTL_DEBUG=1  →  /tmp/minimax-rtl-preload.log */
  try {
    if (typeof process !== "undefined" && process.env && process.env.MINIMAX_RTL_DEBUG &&
        typeof require === "function") {
      require("fs").appendFileSync(
        "/tmp/minimax-rtl-preload.log",
        new Date().toISOString() + "  " + (location ? location.href : "?") + "\\n"
      );
    }
  } catch (e) { /* noop */ }

  /* نشانهٔ اجرای قلاب preload */
  try {
    var de = document.documentElement;
    if (de) de.setAttribute("data-minimax-rtl-preload", "1");
  } catch (e) { /* noop */ }

  var MINIMAX_RTL_CSS = ${cssLiteral};

  /* ---------- تزریق CSS ----------
     webFrame.insertCSS از CSP صفحه عبور می‌کند. origin=user یعنی استایل
     ما حتی از استایل خود اپ (author) قوی‌تر است — به همین دلیل قواعد
     حیاتی در rtl.css با !important نوشته شده‌اند. */
  function injectCss() {
    try {
      var webFrame = null;
      try { webFrame = require("electron").webFrame; } catch (e) { /* noop */ }
      if (webFrame && typeof webFrame.insertCSS === "function") {
        webFrame.insertCSS(MINIMAX_RTL_CSS, { cssOrigin: "user" });
        return true;
      }
    } catch (e) { /* noop */ }

    /* جایگزین: تگ <style> */
    try {
      if (document.getElementById("minimax-rtl-style")) return true;
      var style = document.createElement("style");
      style.id = "minimax-rtl-style";
      style.textContent = MINIMAX_RTL_CSS;
      (document.head || document.documentElement).appendChild(style);
      return true;
    } catch (e) { /* noop */ }
    return false;
  }

  /* اگر صفحه خودش دارایی‌های ما را دارد، CSS از فایل بارگذاری می‌شود و
     نیازی به تزریق دستی نیست. */
  function pageHasAssets() {
    try {
      return !!document.querySelector("[data-minimax-rtl-asset]");
    } catch (e) { return false; }
  }

  function start() {
    if (!pageHasAssets()) injectCss();
  }

  /* ---------- راه‌اندازی ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  /* ---------- منطق جهت‌دهی (inline، بدون eval) ----------
     این کد در isolated world پریلود اجرا می‌شود؛ DOM بین worldها مشترک
     است، پس همان اثرِ اجرا در main world را دارد.
     خودِ اسکریپت با نشانهٔ DOM (data-minimax-rtl) محافظت می‌شود تا اگر
     نسخهٔ <script src> هم در صفحه تزریق شده باشد، دوبار اجرا نشود. */
${autodirIndented}
})();
`;

const OUT_PRELOAD = path.join(PATCH_ROOT, "rtl-preload.cjs");
fs.writeFileSync(OUT_PRELOAD, preload);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + " KB";
console.log(`✅ rtl-inline.css   → ${kb(OUT_CSS)}`);
console.log(`✅ rtl-preload.cjs  → ${kb(OUT_PRELOAD)}  (فونت‌ها: ${refs.size} فایل)`);
