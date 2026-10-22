#!/usr/bin/env node
/**
 * patch-asar.mjs — هستهٔ پچ RTL برای MiniMax Code (macOS)
 *
 * چرا «جراحی asar» و نه extract/pack؟
 *   app.asar این اپ ۴۱۵ مگابایت و ۳۱٬۹۹۹ فایل دارد و برای هر فایل یک
 *   بلوک integrity (SHA256 با blockSize=4MiB) نگه می‌دارد. ابزار
 *   @electron/asar این بلوک‌ها را تولید نمی‌کند و repack حتماً اپ را از
 *   کار می‌اندازد. علاوه بر آن ۴۳۶ فایل با پرچم unpacked در
 *   app.asar.unpacked نگه داشته شده‌اند (native binaries و workerها).
 *
 *   راه‌حل: ناحیهٔ دادهٔ asar اصلی بایت‌به‌بایت حفظ می‌شود؛ فقط
 *     • چند فایل موجود با محتوای جدید جایگزین می‌شوند
 *     • چند فایل جدید اضافه می‌شوند
 *   offset فایل‌های دست‌نخورده (نسبت به شروع ناحیهٔ داده) تغییر نمی‌کند،
 *   پس پرچم unpacked و integrity همهٔ ۳۱٬۹۹۹ فایل سالم می‌مانند.
 *
 * گام‌ها:
 *   1) کلون MiniMax Code.app → MiniMax Code-RTL.app
 *   2) جراحی app.asar + محاسبهٔ integrity فایل‌های جدید/تغییریافته
 *   3) به‌روزرسانی SHA256 هدر asar در Info.plist (ElectronAsarIntegrity)
 *   4) تغییر CFBundleDisplayName (نام نمایشی اپ)
 *   5) جدا کردن userData (تا قفل تک‌نمونه‌ای با نسخهٔ اصلی تداخل نکند)
 *   6) غیرفعال‌سازی auto-updater و hot-update
 *   7) امضای مجدد ad-hoc
 *
 * استفاده:
 *   node patches/scripts/patch-asar.mjs [--src "/Applications/MiniMax Code.app"] \
 *                                        [--out "/Applications/MiniMax Code-RTL.app"]
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* ============================ پارامترها ============================ */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATCH_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(name);

const SRC_APP = getArg("--src", "/Applications/MiniMax Code.app");
const OUT_APP = getArg("--out", "/Applications/MiniMax Code-RTL.app");
const DISPLAY_NAME = path.basename(OUT_APP).replace(/\.app$/i, "");
/* نام پوشهٔ userData مستقل (برای جدا بودن از نسخهٔ اصلی) */
const USER_DATA_NAME = DISPLAY_NAME;

const log = (m) => console.log(`[patch] ${m}`);
const warn = (m) => console.warn(`[patch][warn] ${m}`);
const die = (m) => {
  console.error(`[patch][FATAL] ${m}`);
  process.exit(1);
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/* ======================= ابزارهای asar ======================= */

/**
 * خواندن هدر asar — دقیقاً همان بایتی که Electron هش می‌کند.
 *
 * ساختار فایل:
 *   [0,4)   uint32  payload size پیکل بیرونی (همیشه ۴)
 *   [4,8)   uint32  اندازهٔ ناحیهٔ هدر = 4 + payloadSize
 *   [8,12)  uint32  payloadSize (شروع پیکل هدر)
 *   [12,16) uint32  طول رشتهٔ JSON هدر
 *   [16,…)  رشتهٔ JSON + padding تا مضرب ۴
 *   دادهٔ فایل‌ها از offset = 8 + اندازهٔ ناحیهٔ هدر شروع می‌شود.
 */
function readAsarHeader(buf) {
  const outer = buf.readUInt32LE(0);
  if (outer !== 4) die(`ساختار asar نامعتبر است (u32@0=${outer})`);
  const jsonLen = buf.readUInt32LE(12);
  const headerRegionSize = buf.readUInt32LE(4); // = 4 + payloadSize
  const jsonBuf = buf.subarray(16, 16 + jsonLen);
  const header = JSON.parse(jsonBuf.toString("utf8"));
  const headerSize = 8 + headerRegionSize; // شروع ناحیهٔ داده
  return { jsonBuf, header, headerSize, jsonLen, headerRegionSize };
}

/** ساخت مجدد ناحیهٔ هدر به‌صورت pickle سازگار با Electron */
function writeAsarHeader(header) {
  const jsonBuf = Buffer.from(JSON.stringify(header), "utf8");
  const padLen = (4 - (jsonBuf.length % 4)) % 4;
  const payloadSize = 4 + jsonBuf.length + padLen;

  const region = Buffer.alloc(4 + payloadSize); // = اندازهٔ ناحیهٔ هدر
  region.writeUInt32LE(payloadSize, 0);
  region.writeUInt32LE(jsonBuf.length, 4);
  jsonBuf.copy(region, 8); // بقیه صفر = padding

  const outer = Buffer.alloc(8);
  outer.writeUInt32LE(4, 0);
  outer.writeUInt32LE(region.length, 4);

  return { head: Buffer.concat([outer, region]), jsonBuf };
}

const DEFAULT_BLOCK_SIZE = 4194304; // 4 MiB — همان مقداری که خود اپ استفاده می‌کند

/** ساخت بلوک integrity به سبک Electron */
function integrityOf(buf, blockSize = DEFAULT_BLOCK_SIZE) {
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(sha256(buf));
  } else {
    for (let i = 0; i < buf.length; i += blockSize) {
      blocks.push(sha256(buf.subarray(i, Math.min(i + blockSize, buf.length))));
    }
  }
  return { algorithm: "SHA256", hash: sha256(buf), blockSize, blocks };
}

const pathParts = (p) => p.split("/").filter(Boolean);

function getNode(header, p) {
  let node = header;
  for (const seg of pathParts(p)) {
    if (!node.files || !node.files[seg]) return null;
    node = node.files[seg];
  }
  return node;
}

function setFile(header, p, entry) {
  const parts = pathParts(p);
  const name = parts.pop();
  let node = header;
  for (const seg of parts) {
    if (!node.files) node.files = {};
    if (!node.files[seg]) node.files[seg] = { files: {} };
    node = node.files[seg];
  }
  if (!node.files) node.files = {};
  node.files[name] = entry;
}

function readFileFromAsar(buf, headerSize, node) {
  const off = headerSize + Number(node.offset);
  return buf.subarray(off, off + node.size);
}

/** پیدا کردن blockSize واقعی از روی یکی از فایل‌های موجود */
function detectBlockSize(header) {
  let found = null;
  const walk = (node) => {
    if (found) return;
    for (const d of Object.values(node.files || {})) {
      if (found) return;
      if (d.files) walk(d);
      else if (d.integrity && typeof d.integrity.blockSize === "number") found = d.integrity.blockSize;
    }
  };
  walk(header);
  return found || DEFAULT_BLOCK_SIZE;
}

function readVersion(appPath) {
  try {
    const xml = fs.readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const m = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/.exec(xml);
    return m ? m[1] : "unknown";
  } catch {
    return "unknown";
  }
}

/* ============================ محتوای پچ ============================ */

/** قلاب preload (CommonJS) که به ابتدای preloadهای اپ اضافه می‌شود */
function readPreloadHook() {
  const p = path.join(PATCH_ROOT, "rtl-preload.cjs");
  if (!fs.existsSync(p)) {
    die(`فایل پچ پیدا نشد: ${p}\n(ابتدا build-preload.cjs.js را اجرا کنید)`);
  }
  return fs.readFileSync(p, "utf8");
}

/** تزریق link+script در فایل‌های HTML */
function injectIntoHtml(html, hrefBase) {
  if (html.includes("data-minimax-rtl-asset")) return html; // قبلاً تزریق شده

  const tags =
    `\n<link rel="stylesheet" href="${hrefBase}/rtl.css" data-minimax-rtl-asset="css">` +
    `\n<script src="${hrefBase}/rtl-autodir.js" data-minimax-rtl-asset="js" defer></script>\n`;

  const headClose = html.lastIndexOf("</head>");
  if (headClose !== -1) {
    return html.slice(0, headClose) + tags + html.slice(headClose);
  }
  const bodyOpen = html.search(/<body[^>]*>/i);
  if (bodyOpen !== -1) {
    const end = html.indexOf(">", bodyOpen) + 1;
    return html.slice(0, end) + tags + html.slice(end);
  }
  return tags + html;
}

/* ============================ گام‌ها ============================ */

function stepClone() {
  if (fs.existsSync(OUT_APP)) {
    log(`حذف خروجی قبلی: ${OUT_APP}`);
    execFileSync("rm", ["-rf", OUT_APP]);
  }
  log(`کلون ${SRC_APP} → ${OUT_APP}`);
  execFileSync("cp", ["-R", SRC_APP, OUT_APP], { stdio: "inherit" });
}

/** فهرست فایل‌های HTML که باید تزریق شوند (کشف پویا، نه hardcode) */
function findHtmlFiles(header) {
  const found = [];
  const walk = (node, prefix) => {
    for (const [name, d] of Object.entries(node.files || {})) {
      const pp = prefix ? `${prefix}/${name}` : name;
      if (d.files) {
        walk(d, pp);
      } else if (name.endsWith(".html") && !d.unpacked) {
        found.push(pp);
      }
    }
  };
  walk(header, "");
  return found;
}

function stepPatchAsar() {
  const asarPath = path.join(OUT_APP, "Contents", "Resources", "app.asar");
  const srcAsar = path.join(SRC_APP, "Contents", "Resources", "app.asar");
  if (!fs.existsSync(srcAsar)) die(`app.asar منبع پیدا نشد: ${srcAsar}`);

  const original = fs.readFileSync(srcAsar);
  const { header, headerSize } = readAsarHeader(original);
  const data = original.subarray(headerSize);
  const blockSize = detectBlockSize(header);

  log(
    `asar اصلی: ${(original.length / 1048576).toFixed(1)} MB | هدر: ${headerSize} بایت | داده: ${(
      data.length / 1048576
    ).toFixed(1)} MB | blockSize=${blockSize}`
  );

  /** فهرست کارها: { rel, buf } — همه در انتهای ناحیهٔ داده نوشته می‌شوند */
  const plan = [];
  const report = { modified: [], added: [] };

  const readText = (rel) => {
    const node = getNode(header, rel);
    if (!node) return null;
    return readFileFromAsar(original, headerSize, node).toString("utf8");
  };

  /* ---------- ۱) قلاب preload ---------- */
  const preloadHook = readPreloadHook();
  const preloadTargets = [
    "dist/main/preload.js", // پنجرهٔ اصلی گفت‌وگو، ورود، onboarding، لاگ‌ویوور، mini-chat
    "dist/main/model-menu-preload.js" // پاپ‌آپ انتخاب مدل
  ];
  for (const rel of preloadTargets) {
    const text = readText(rel);
    if (text === null) {
      warn(`${rel} پیدا نشد — قلاب preload اعمال نشد`);
      continue;
    }
    if (text.includes("MINIMAX_RTL_CSS")) {
      log(`  = preload از قبل پچ‌شده: ${rel}`);
      continue;
    }
    plan.push({ rel, buf: Buffer.from(preloadHook + text, "utf8") });
    report.modified.push(rel);
    log(`  ~ preload hooked: ${rel}`);
  }

  /* ---------- ۲) جدا کردن userData از نسخهٔ اصلی ---------- */
  {
    const rel = "dist/main/index.js";
    const text = readText(rel);
    if (text === null) {
      warn(`${rel} پیدا نشد — جداسازی userData اعمال نشد`);
    } else if (text.includes("MINIMAX_RTL_USERDATA")) {
      log("  = userData از قبل جدا شده بود");
    } else {
      const anchor = "electron_1.app.setName(APP_NAME);";
      if (!text.includes(anchor)) {
        warn(`الگوی setName در ${rel} پیدا نشد — جداسازی userData اعمال نشد`);
      } else {
        const inject = [
          anchor,
          "/* MiniMax Code-RTL: userData مستقل از نسخهٔ اصلی.",
          "   دلیل: قفل تک‌نمونه‌ای (single instance lock) و داده‌های نشست",
          "   نباید بین «MiniMax Code» و «MiniMax Code-RTL» مشترک باشند. */",
          "try {",
          "    const __mmRtlPath = require('node:path');",
          "    electron_1.app.setPath('userData', __mmRtlPath.join(",
          "        electron_1.app.getPath('appData'),",
          `        ${JSON.stringify(USER_DATA_NAME)}));`,
          "    /* MINIMAX_RTL_USERDATA */",
          "}",
          "catch (e) { /* noop */ }"
        ].join("\n");
        const next = text.replace(anchor, inject);
        plan.push({ rel, buf: Buffer.from(next, "utf8") });
        report.modified.push(rel);
        log(`  ~ userData جدا شد: ${rel}`);
      }
    }
  }

  /* ---------- ۳) غیرفعال‌سازی hot-update ---------- */
  {
    const rel = "dist/main/modules/hotUpdate/config.js";
    const text = readText(rel);
    if (text === null) {
      warn(`${rel} پیدا نشد — hot-update غیرفعال نشد`);
    } else if (text.includes("MINIMAX_RTL_NO_HOT_UPDATE")) {
      log("  = hot-update از قبل غیرفعال شده بود");
    } else {
      const anchor = "function resolveHotUpdateChannel(identity) {";
      if (!text.includes(anchor)) {
        warn(`الگوی resolveHotUpdateChannel در ${rel} پیدا نشد — hot-update غیرفعال نشد`);
      } else {
        const next = text.replace(
          anchor,
          anchor +
            "\n    /* MINIMAX_RTL_NO_HOT_UPDATE: نسخهٔ RTL نباید رندرر را با hot-update\n" +
            "       جایگزین کند، چون فایل‌های پچ‌شدهٔ out/ را از دست می‌دهد. */\n" +
            "    return null;"
        );
        plan.push({ rel, buf: Buffer.from(next, "utf8") });
        report.modified.push(rel);
        log(`  ~ hot-update غیرفعال شد: ${rel}`);
      }
    }
  }

  /* ---------- ۴) تزریق در فایل‌های HTML رندرر ---------- */
  const htmlFiles = findHtmlFiles(header);
  let htmlCount = 0;
  for (const rel of htmlFiles) {
    // فقط صفحه‌هایی که واقعاً در اپ نمایش داده می‌شوند
    // (public/ فقط قالب ساخت است و سرو نمی‌شود؛ node_modules و dist/ مربوط نیستند)
    if (rel.startsWith("node_modules/")) continue;
    if (rel.startsWith("public/")) continue;
    if (rel.startsWith("dist/")) continue;

    const text = readText(rel);
    if (text === null) continue;

    // مسیر پایهٔ دارایی‌ها:
    //   out/pdf/web/viewer.html → از ریشهٔ pdf سرو می‌شود
    //   بقیه → از ریشهٔ out
    const base = rel.startsWith("out/pdf/") ? "/minimax-rtl" : "/minimax-rtl";
    const next = injectIntoHtml(text, base);
    if (next === text) continue;
    plan.push({ rel, buf: Buffer.from(next, "utf8") });
    report.modified.push(rel);
    htmlCount++;
  }
  log(`  ~ ${htmlCount} فایل HTML تزریق شد`);

  /* ---------- ۵) پاپ‌آپ انتخاب مدل (file:// با CSP سخت‌گیرانه) ---------- */
  {
    const rel = "dist/model-menu/index.html";
    const text = readText(rel);
    if (text === null) {
      warn(`${rel} پیدا نشد — پاپ‌آپ مدل تزریق نشد`);
    } else {
      let next = injectIntoHtml(text, "./minimax-rtl");
      // CSP این صفحه font-src 'self' است و data: را اجازه نمی‌دهد؛
      // چون فونت به‌صورت inline (data-URI) تزریق می‌شود، اجازهٔ data: لازم است.
      next = next.replace(/font-src 'self'/g, "font-src 'self' data:");
      plan.push({ rel, buf: Buffer.from(next, "utf8") });
      report.modified.push(rel);
      log(`  ~ پاپ‌آپ مدل تزریق شد (+ data: به font-src اضافه شد): ${rel}`);
    }
  }

  /* ---------- ۶) فایل‌های پچ ---------- */
  const rtlCss = fs.readFileSync(path.join(PATCH_ROOT, "rtl.css"), "utf8");
  const rtlInlineCss = fs.existsSync(path.join(PATCH_ROOT, "rtl-inline.css"))
    ? fs.readFileSync(path.join(PATCH_ROOT, "rtl-inline.css"), "utf8")
    : rtlCss;
  const autodirJs = fs.readFileSync(path.join(PATCH_ROOT, "rtl-autodir.js"), "utf8");

  const fontFiles = fs
    .readdirSync(path.join(PATCH_ROOT, "assets"))
    .filter((f) => f.endsWith(".woff2"))
    .map((f) => ({
      name: f,
      buf: fs.readFileSync(path.join(PATCH_ROOT, "assets", f))
    }));

  const addFile = (rel, buf) => {
    plan.push({ rel, buf: Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8") });
    report.added.push(rel);
  };

  // ریشهٔ اصلی رندرر (app://)
  addFile("out/minimax-rtl/rtl.css", rtlCss);
  addFile("out/minimax-rtl/rtl-autodir.js", autodirJs);
  // ریشهٔ نمایشگر PDF (از طریق pdfRoots سرو می‌شود)
  addFile("out/pdf/minimax-rtl/rtl.css", rtlCss);
  addFile("out/pdf/minimax-rtl/rtl-autodir.js", autodirJs);
  // پاپ‌آپ انتخاب مدل (file://) — اینجا فونت inline است چون origin، file:// است
  addFile("dist/model-menu/minimax-rtl/rtl.css", rtlInlineCss);
  addFile("dist/model-menu/minimax-rtl/rtl-autodir.js", autodirJs);

  // فونت‌ها کنار هر نسخهٔ rtl.css قرار می‌گیرند تا مسیر نسبی ./fonts/… درست باشد
  for (const f of fontFiles) {
    addFile(`out/minimax-rtl/fonts/${f.name}`, f.buf);
    addFile(`out/pdf/minimax-rtl/fonts/${f.name}`, f.buf);
  }

  log(`  + ${report.added.length} فایل جدید اضافه شد`);

  /* ---------- ۷) فرادادهٔ پچ ---------- */
  const info = {
    patch: "minimax-rtl",
    patchedAt: new Date().toISOString(),
    sourceApp: SRC_APP,
    sourceVersion: readVersion(SRC_APP),
    outputApp: OUT_APP,
    displayName: DISPLAY_NAME,
    userDataDir: path.join(os.homedir(), "Library", "Application Support", USER_DATA_NAME),
    files: {
      modified: report.modified,
      added: report.added
    }
  };
  plan.push({
    rel: "minimax-rtl/PATCH-INFO.json",
    buf: Buffer.from(JSON.stringify(info, null, 2) + "\n", "utf8")
  });

  /* ---------- ۸) تخصیص offset و به‌روزرسانی هدر ---------- */
  let cursor = data.length;
  for (const item of plan) {
    const entry = {
      size: item.buf.length,
      offset: String(cursor),
      integrity: integrityOf(item.buf, blockSize)
    };
    setFile(header, item.rel, entry);
    item.entry = entry;
    cursor += item.buf.length;
  }

  /* ---------- ۹) نوشتن asar جدید ---------- */
  const { head, jsonBuf } = writeAsarHeader(header);
  const fd = fs.openSync(asarPath, "w");
  try {
    fs.writeSync(fd, head);
    fs.writeSync(fd, data);
    for (const item of plan) fs.writeSync(fd, item.buf);
  } finally {
    fs.closeSync(fd);
  }

  const newHeaderHash = sha256(jsonBuf);
  log(
    `asar جدید نوشته شد (${(fs.statSync(asarPath).size / 1048576).toFixed(1)} MB) — هش هدر: ${newHeaderHash.slice(
      0,
      12
    )}…`
  );

  return { newHeaderHash, info };
}

/* ---------------------- Info.plist ---------------------- */
function stepUpdatePlist(newHeaderHash) {
  const plistPath = path.join(OUT_APP, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) die(`Info.plist پیدا نشد: ${plistPath}`);
  let xml = fs.readFileSync(plistPath, "utf8");

  if (xml.startsWith("bplist")) {
    die("Info.plist دودویی است؛ این اسکریپت فقط plist متنی (XML) را پشتیبانی می‌کند.");
  }

  /* هش integrity هدر asar */
  const hashRe =
    /(ElectronAsarIntegrity[\s\S]*?<key>hash<\/key>\s*<string>)([0-9a-fA-F]{64})(<\/string>)/;
  if (hashRe.test(xml)) {
    xml = xml.replace(hashRe, (_m, a, _old, c) => a + newHeaderHash + c);
  } else {
    warn("کلید ElectronAsarIntegrity در Info.plist پیدا نشد (ادامه می‌دهیم)");
  }

  /* نام نمایشی اپ.
     نکتهٔ مهم: CFBundleName عمداً دست‌نخورده می‌ماند، چون Electron
     با آن نام helper appها را پیدا می‌کند (Frameworks/<name> Helper.app).
     CFBundleDisplayName روی macOS بر CFBundleName مقدم است و نامی است
     که کاربر در Dock و Finder می‌بیند. */
  const setKey = (key, value, required) => {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
    if (re.test(xml)) {
      xml = xml.replace(re, (_m, a, _old, c) => a + value + c);
      return true;
    }
    if (required) die(`کلید ${key} در Info.plist پیدا نشد`);
    return false;
  };

  setKey("CFBundleDisplayName", DISPLAY_NAME, true);
  if (hasFlag("--set-bundle-name")) {
    setKey("CFBundleName", DISPLAY_NAME, true);
    log("CFBundleName هم تغییر کرد (حالت آزمایشی)");
  }

  fs.writeFileSync(plistPath, xml);

  if (hashRe.test(xml)) {
    const check = fs.readFileSync(plistPath, "utf8");
    if (!check.includes(newHeaderHash)) die("نوشتن هش در Info.plist تأیید نشد");
  }
  log(`Info.plist به‌روزرسانی شد — CFBundleDisplayName=${DISPLAY_NAME}`);
}

/* ---------------------- codesign ---------------------- */
function stepCodesign() {
  log("امضای مجدد ad-hoc …");
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", OUT_APP], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", OUT_APP], { stdio: "inherit" });
  log("امضا معتبر است ✓");
}

/* ---------------------- updater ---------------------- */
/**
 * غیرفعال‌سازی auto-updater.
 * app-update.yml کنار app.asar در Contents/Resources است. تغییر نام آن
 * باعث می‌شود electron-updater در زمان check خطای مهارشده بدهد و نسخهٔ
 * RTL بازنویسی نشود. کاربر باید بعد از هر آپدیتِ نسخهٔ اصلی، پچ را
 * دوباره اجرا کند (apply-patch.sh).
 */
function stepDisableUpdater() {
  const res = path.join(OUT_APP, "Contents", "Resources");
  const from = path.join(res, "app-update.yml");
  const to = path.join(res, "app-update.yml.minimax-rtl-disabled");
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    log("app-update.yml غیرفعال شد (جلوگیری از بروزرسانی خودکار نسخهٔ RTL)");
  } else if (fs.existsSync(to)) {
    log("app-update.yml از قبل غیرفعال شده است");
  } else {
    warn("app-update.yml در Contents/Resources پیدا نشد — مرحلهٔ updater رد شد");
  }
}

/* ---------------------- userData ---------------------- */
/**
 * کپی اولیهٔ userData نسخهٔ اصلی به پوشهٔ مستقل RTL.
 * هدف: کاربر مجبور نباشد دوباره وارد حساب شود.
 * اگر پوشهٔ مقصد از قبل وجود داشته باشد، دست نمی‌خوریم.
 */
function stepSeedUserData() {
  const originalDir = path.join(os.homedir(), "Library", "Application Support", "MiniMax Agent");
  const targetDir = path.join(os.homedir(), "Library", "Application Support", USER_DATA_NAME);

  if (!fs.existsSync(originalDir)) {
    log("userData نسخهٔ اصلی پیدا نشد — مرحلهٔ seed رد شد");
    return;
  }
  if (fs.existsSync(targetDir)) {
    log(`userData RTL از قبل وجود دارد: ${targetDir}`);
    return;
  }
  try {
    log(`کپی userData اصلی → ${targetDir}`);
    execFileSync("cp", ["-R", originalDir, targetDir]);
    // فایل‌های قفلِ Chromium نباید کپی شوند
    for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      const p = path.join(targetDir, lock);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
    log("✓ userData اولیه کپی شد (ورود کاربر حفظ می‌شود)");
  } catch (e) {
    warn(`کپی userData ناموفق بود: ${e.message}`);
  }
}

/* ============================ اجرا ============================ */
try {
  log(`=== MiniMax Code-RTL Patcher — منبع: ${SRC_APP} ===`);
  if (process.platform !== "darwin") die("این اسکریپت فقط روی macOS پشتیبانی می‌شود.");
  if (!fs.existsSync(SRC_APP)) die(`اپ منبع پیدا نشد: ${SRC_APP}`);

  stepClone();
  const { newHeaderHash } = stepPatchAsar();
  stepUpdatePlist(newHeaderHash);
  stepDisableUpdater();
  stepCodesign();
  stepSeedUserData();

  log(`✅ تمام شد: ${OUT_APP}`);
  log(`اجرا:  open "${OUT_APP}"`);
} catch (err) {
  die(err && err.stack ? err.stack : String(err));
}
