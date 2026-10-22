#!/usr/bin/env node
/**
 * build-preload.cjs.js — ساخت آرتیفکت‌های رندرر پچ RTL
 *
 * ورودی‌ها : patches/rtl.css        (استایل + @font-face با مسیر ./assets)
 *            patches/rtl-autodir.js (منطق جهت‌دهی)
 *            patches/assets/*.woff2  (فونت Vazirmatn)
 *
 * خروجی‌ها :
 *   patches/rtl-inline.css   — rtl.css با فونت‌های data-URI
 *                              (برای webContents.insertCSS در main process)
 *   patches/rtl-preload.cjs  — نسخهٔ CommonJS برای preloadهای .cjs و
 *                              session.setPreloads / registerPreloadScript
 *   patches/rtl-preload.mjs  — نسخهٔ ESM برای preloadهای .mjs خود اپ
 *
 * اجرا: node patches/scripts/build-preload.cjs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PATCH_ROOT = path.resolve(__dirname, "..");

const cssSource = fs.readFileSync(path.join(PATCH_ROOT, "rtl.css"), "utf8");
const autodirSource = fs.readFileSync(path.join(PATCH_ROOT, "rtl-autodir.js"), "utf8");

/* ---------- تبدیل url(./assets/X) به data-URI ---------- */
function toDataUri(file) {
  const buf = fs.readFileSync(path.join(PATCH_ROOT, "assets", file));
  return "data:font/woff2;base64," + buf.toString("base64");
}

let inlineCss = cssSource;
const refs = new Set(inlineCss.match(/\.\/assets\/[A-Za-z0-9._-]+/g) || []);
for (const ref of refs) {
  const file = ref.replace("./assets/", "");
  const abs = path.join(PATCH_ROOT, "assets", file);
  if (!fs.existsSync(abs)) {
    console.error(`[build] فونت پیدا نشد: ${abs}`);
    process.exit(1);
  }
  inlineCss = inlineCss.split(ref).join(toDataUri(file));
}

const OUT_CSS = path.join(PATCH_ROOT, "rtl-inline.css");
fs.writeFileSync(OUT_CSS, inlineCss);

const banner = (kind) => `/* ============================================================
 * Kimi RTL Patch — rtl-preload.${kind}
 * ⚠️ فایل تولیدشده (AUTO-GENERATED) — دستی ویرایش نکنید.
 * منبع     : patches/rtl.css + patches/rtl-autodir.js
 * بازسازی  : node patches/scripts/build-preload.cjs.js
 * ============================================================ */`;

const cssLiteral = JSON.stringify(inlineCss);
const autodirIndented = autodirSource.replace(/^/gm, "  ");

/* ---------- ۱) نسخهٔ CommonJS (rtl-preload.cjs) ---------- */
const preloadCjs = `${banner("cjs")}
"use strict";
(function () {
  /* ردیابی اختیاری:  KIMI_RTL_DEBUG=1  →  /tmp/kimi-rtl-preload.log */
  try {
    if (typeof process !== "undefined" && process.env && process.env.KIMI_RTL_DEBUG &&
        typeof require === "function") {
      require("fs").appendFileSync(
        "/tmp/kimi-rtl-preload.log",
        new Date().toISOString() + "  cjs  " + location.href + "\\n"
      );
    }
  } catch (e) { /* noop */ }

  /* نشانهٔ اجرا برای لایهٔ اطمینان در main process + ثبت مسیرِ تزریق */
  var mark = function (src) {
    try {
      var de = document.documentElement;
      if (!de) return false;
      de.setAttribute("data-kimi-rtl", "1");
      var prev = de.getAttribute("data-kimi-rtl-src");
      if (!prev) de.setAttribute("data-kimi-rtl-src", src);
      else if (prev.indexOf(src) < 0) de.setAttribute("data-kimi-rtl-src", prev + "+" + src);
      return true;
    } catch (e) { return false; }
  };
  if (!mark("cjs")) {
    try {
      document.addEventListener("DOMContentLoaded", function () { mark("cjs"); }, { once: true });
    } catch (e) { /* noop */ }
  }

  var KIMI_RTL_CSS = ${cssLiteral};

  /* ---------- تزریق CSS ----------
     webFrame.insertCSS از CSP صفحه عبور می‌کند و در مبدأ user اعمال
     می‌شود؛ اگر در دسترس نبود به <style> برمی‌گردیم. */
  var injected = false;
  try {
    var webFrame = null;
    try { webFrame = require("electron").webFrame; } catch (e) { /* noop */ }
    if (webFrame && typeof webFrame.insertCSS === "function") {
      webFrame.insertCSS(KIMI_RTL_CSS, { cssOrigin: "user" });
      injected = true;
    }
  } catch (e) { /* noop */ }

  if (!injected) {
    try {
      var style = document.createElement("style");
      style.id = "kimi-rtl-style";
      style.textContent = KIMI_RTL_CSS;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) { /* noop */ }
  }

  /* ---------- منطق جهت‌دهی (inline، بدون eval) ---------- */
${autodirIndented}
})();
`;

/* ---------- ۲) نسخهٔ ESM (rtl-preload.mjs) ---------- */
const preloadMjs = `${banner("mjs")}
import { webFrame as __kimiWebFrame } from "electron";

(function () {
  /* نشانهٔ اجرا برای لایهٔ اطمینان در main process + ثبت مسیرِ تزریق */
  var mark = function (src) {
    try {
      var de = document.documentElement;
      if (!de) return false;
      de.setAttribute("data-kimi-rtl", "1");
      var prev = de.getAttribute("data-kimi-rtl-src");
      if (!prev) de.setAttribute("data-kimi-rtl-src", src);
      else if (prev.indexOf(src) < 0) de.setAttribute("data-kimi-rtl-src", prev + "+" + src);
      return true;
    } catch (e) { return false; }
  };
  if (!mark("mjs")) {
    try {
      document.addEventListener("DOMContentLoaded", function () { mark("mjs"); }, { once: true });
    } catch (e) { /* noop */ }
  }

  var KIMI_RTL_CSS = ${cssLiteral};

  var injected = false;
  try {
    if (__kimiWebFrame && typeof __kimiWebFrame.insertCSS === "function") {
      __kimiWebFrame.insertCSS(KIMI_RTL_CSS, { cssOrigin: "user" });
      injected = true;
    }
  } catch (e) { /* noop */ }

  if (!injected) {
    try {
      var style = document.createElement("style");
      style.id = "kimi-rtl-style";
      style.textContent = KIMI_RTL_CSS;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) { /* noop */ }
  }

  /* ---------- منطق جهت‌دهی (inline، بدون eval) ---------- */
${autodirIndented}
})();
`;

const OUT_CJS = path.join(PATCH_ROOT, "rtl-preload.cjs");
const OUT_MJS = path.join(PATCH_ROOT, "rtl-preload.mjs");
fs.writeFileSync(OUT_CJS, preloadCjs);
fs.writeFileSync(OUT_MJS, preloadMjs);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + " KB";
console.log(`✅ rtl-inline.css  → ${kb(OUT_CSS)}`);
console.log(`✅ rtl-preload.cjs → ${kb(OUT_CJS)}`);
console.log(`✅ rtl-preload.mjs → ${kb(OUT_MJS)}  (فونت‌ها: ${refs.size} فایل)`);
