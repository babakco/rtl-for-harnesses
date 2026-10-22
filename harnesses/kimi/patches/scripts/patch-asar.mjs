#!/usr/bin/env node
/**
 * patch-asar.mjs — هستهٔ پچ RTL برای Kimi Desktop (macOS)
 *
 * چرا «جراحی asar» و نه extract/pack؟
 *   Kimi از ElectronAsarIntegrity استفاده می‌کند (fuse فعال) و در این حالت
 *   Electron برای *هر* فایل داخل asar یک بلوک integrity با SHA256 و
 *   blockSize=4MiB اجباری می‌داند؛ اگر نباشد FATAL می‌دهد:
 *     "Failed to read integrity for file in ASAR archive"
 *   ابزار @electron/asar چیزی به نام integrity تولید نمی‌کند، پس repack
 *   حتماً اپ را از کار می‌اندازد. علاوه بر آن Kimi نه فایل را با پرچم
 *   unpacked در app.asar.unpacked نگه می‌دارد (فایل‌های .node و دو worker
 *   که به‌صورت process جدا اجرا می‌شوند).
 *
 * راه‌حل: ناحیهٔ دادهٔ asar اصلی بایت‌به‌بایت حفظ می‌شود؛ فقط
 *   • رکورد out/main/index.js با محتوای جدید (تزریق import) جایگزین می‌شود
 *   • چند فایل جدید زیر kimi-rtl/ اضافه می‌شود
 *   offset فایل‌های موجود (نسبت به شروع ناحیهٔ داده) دست‌نخورده می‌ماند،
 *   پس پرچم unpacked و integrity همهٔ ۸۹۵ فایل سالم می‌مانند.
 *
 * گام‌ها:
 *   1) کلون Kimi.app → Kimi RTL.app   (نسخهٔ اصلی دست‌نخورده می‌ماند)
 *   2) جراحی app.asar + محاسبهٔ integrity فایل‌های جدید/تغییریافته
 *   3) بازمحاسبهٔ SHA256 هدر asar و به‌روزرسانی ElectronAsarIntegrity در Info.plist
 *   4) تغییر CFBundleName و نام helper appها (پوشه + فایل اجرایی + plist)
 *   5) غیرفعال‌سازی auto-updater (app-update.yml در Contents/Resources)
 *   6) امضای مجدد ad-hoc
 *
 * استفاده:
 *   node patches/scripts/patch-asar.mjs [--src /Applications/Kimi.app] [--out "/Applications/Kimi RTL.app"]
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
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

const SRC_APP = getArg("--src", "/Applications/Kimi.app");
const OUT_APP = getArg("--out", "/Applications/Kimi RTL.app");

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
 *
 * مرجع: shell/common/asar/archive.cc (Electron v43.7.3) →
 *   PickleIterator(...).ReadString(&header) ⇒ فقط بایت‌های JSON هش می‌شوند
 *   (بدون ۴ بایت طول و بدون padding).
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
  jsonBuf.copy(region, 8); // بقیه صفر می‌ماند = padding

  const outer = Buffer.alloc(8);
  outer.writeUInt32LE(4, 0);
  outer.writeUInt32LE(region.length, 4);

  return { head: Buffer.concat([outer, region]), jsonBuf };
}

const BLOCK_SIZE = 4194304; // 4 MiB — همان مقداری که Kimi استفاده می‌کند

/** ساخت بلوک integrity به سبک Electron */
function integrityOf(buf) {
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(sha256(buf));
  } else {
    for (let i = 0; i < buf.length; i += BLOCK_SIZE) {
      blocks.push(sha256(buf.subarray(i, Math.min(i + BLOCK_SIZE, buf.length))));
    }
  }
  return { algorithm: "SHA256", hash: sha256(buf), blockSize: BLOCK_SIZE, blocks };
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

function readVersion(appPath) {
  try {
    const xml = fs.readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8");
    const m = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/.exec(xml);
    return m ? m[1] : "unknown";
  } catch {
    return "unknown";
  }
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

/** فایل‌های پچ که باید داخل <asar>/kimi-rtl/ قرار بگیرند */
function collectPatchFiles() {
  const required = [
    "rtl-main-bootstrap.mjs",
    "rtl-preload.cjs",
    "rtl-preload.mjs",
    "rtl-autodir.js",
    "rtl-inline.css"
  ];
  const optional = ["assets/OFL.txt"];

  const out = [];
  for (const rel of required) {
    const abs = path.join(PATCH_ROOT, rel);
    if (!fs.existsSync(abs)) die(`فایل پچ پیدا نشد: ${abs}\n(ابتدا build-preload را اجرا کنید)`);
    out.push({ rel: "kimi-rtl/" + path.basename(rel), buf: fs.readFileSync(abs) });
  }
  for (const rel of optional) {
    const abs = path.join(PATCH_ROOT, rel);
    if (fs.existsSync(abs)) out.push({ rel: "kimi-rtl/" + path.basename(rel), buf: fs.readFileSync(abs) });
  }
  return out;
}

const MAIN_REL = "out/main/index.js";
const PRELOAD_DIR = "out/preload";
const HOOK_HINT = "kimi-rtl/rtl-preload";

/**
 * تزریق پچ در preloadهای خود اپ.
 *
 * چرا لازم است؟ session.registerPreloadScript در این نسخه از Electron
 * برای WebContentsهایی که webPreferences.preload صریح دارند اجرا نمی‌شود؛
 * پس مطمئن‌ترین مسیر، تکیه بر همان preloadهایی است که خود Kimi استفاده
 * می‌کند و ثابت شده اجرا می‌شوند.
 *
 * تزریق به‌صورت «ایمن» انجام می‌شود:
 *   .mjs → import("…/rtl-preload.mjs").catch(() => {})   (dynamic، خطا مهار می‌شود)
 *   .cjs/.js → try { require("…/rtl-preload.cjs") } catch {}
 */
function hookAppPreloads(original, headerSize, header, plan) {
  const dir = getNode(header, PRELOAD_DIR);
  if (!dir || !dir.files) {
    warn(`${PRELOAD_DIR} در asar پیدا نشد — تزریق preload انجام نشد`);
    return 0;
  }
  let count = 0;
  for (const name of Object.keys(dir.files)) {
    const node = dir.files[name];
    if (!node || node.files || node.unpacked) continue;
    if (!/^preload-.*\.(mjs|cjs|js)$/.test(name)) continue;

    const text = readFileFromAsar(original, headerSize, node).toString("utf8");
    if (text.includes(HOOK_HINT)) continue;

    const prefix = name.endsWith(".cjs") || name.endsWith(".js")
      ? 'try { require("../../kimi-rtl/rtl-preload.cjs"); } catch (e) {}\n'
      : 'import("../../kimi-rtl/rtl-preload.mjs").catch(() => {});\n';

    plan.push({ rel: `${PRELOAD_DIR}/${name}`, buf: Buffer.from(prefix + text, "utf8") });
    log(`  ~ preload hooked: ${name}`);
    count++;
  }
  return count;
}

function stepPatchAsar() {
  const asarPath = path.join(OUT_APP, "Contents", "Resources", "app.asar");
  const srcAsar = path.join(SRC_APP, "Contents", "Resources", "app.asar");
  if (!fs.existsSync(srcAsar)) die(`app.asar منبع پیدا نشد: ${srcAsar}`);

  const original = fs.readFileSync(srcAsar);
  const { header, headerSize } = readAsarHeader(original);
  const data = original.subarray(headerSize);
  log(
    `asar اصلی: ${(original.length / 1048576).toFixed(1)} MB | هدر: ${headerSize} بایت | داده: ${(
      data.length / 1048576
    ).toFixed(1)} MB`
  );

  /** فهرست کارها: { rel, buf } — همه در انتهای ناحیهٔ داده نوشته می‌شوند */
  const plan = [];

  /* ---- ۱) تزریق import در out/main/index.js ---- */
  const mainNode = getNode(header, MAIN_REL);
  if (!mainNode) die(`${MAIN_REL} در هدر asar پیدا نشد`);

  const mainBuf = readFileFromAsar(original, headerSize, mainNode);
  let mainText = mainBuf.toString("utf8");
  let mainChanged = false;
  if (!mainText.includes("rtl-main-bootstrap")) {
    mainText = 'import "../../kimi-rtl/rtl-main-bootstrap.mjs";\n' + mainText;
    mainChanged = true;
    plan.push({ rel: MAIN_REL, buf: Buffer.from(mainText, "utf8") });
    log(`bootstrap به ${MAIN_REL} تزریق شد (${mainNode.size} → ${Buffer.byteLength(mainText)} بایت)`);
  } else {
    log("bootstrap از قبل تزریق شده بود — رد شد");
  }

  /* ---- ۲) تزریق در preloadهای خود اپ (مسیر تضمینی) ---- */
  const hooked = hookAppPreloads(original, headerSize, header, plan);
  log(`preloadهای اپ تزریق‌شده: ${hooked}`);

  /* ---- ۳) فایل‌های پچ ---- */
  for (const f of collectPatchFiles()) {
    plan.push(f);
    log(`+ ${f.rel} (${(f.buf.length / 1024).toFixed(1)} KB)`);
  }

  /* ---- ۴) فرادادهٔ پچ ---- */
  const info = {
    patch: "kimi-rtl",
    patchedAt: new Date().toISOString(),
    sourceApp: SRC_APP,
    sourceVersion: readVersion(SRC_APP),
    outputApp: OUT_APP,
    injectedImport: MAIN_REL,
    hookedAppPreloads: hooked,
    files: plan
      .filter((p) => p.rel.startsWith("kimi-rtl/"))
      .map((p) => p.rel)
  };
  plan.push({
    rel: "kimi-rtl/PATCH-INFO.json",
    buf: Buffer.from(JSON.stringify(info, null, 2) + "\n", "utf8")
  });

  /* ---- ۵) تخصیص offset و به‌روزرسانی هدر ---- */
  let cursor = data.length;
  for (const item of plan) {
    const entry = { size: item.buf.length, offset: String(cursor), integrity: integrityOf(item.buf) };
    setFile(header, item.rel, entry);
    item.entry = entry;
    cursor += item.buf.length;
  }

  /* ---- ۶) نوشتن asar جدید ---- */
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

  return { newHeaderHash };
}

/**
 * غیرفعال‌سازی auto-updater.
 * نکته: app-update.yml داخل app.asar نیست؛ یک فایل کنار آن در
 * Contents/Resources است. تغییر نام آن باعث می‌شود electron-updater
 * در زمان check خطای مهارشده بدهد و نسخهٔ RTL بازنویسی نشود.
 */
function stepDisableUpdater() {
  const res = path.join(OUT_APP, "Contents", "Resources");
  const from = path.join(res, "app-update.yml");
  const to = path.join(res, "app-update.yml.kimi-rtl-disabled");
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    log("app-update.yml غیرفعال شد (جلوگیری از بروزرسانی خودکار روی نسخهٔ RTL)");
  } else if (fs.existsSync(to)) {
    log("app-update.yml از قبل غیرفعال شده است");
  } else {
    warn("app-update.yml در Contents/Resources پیدا نشد — مرحلهٔ updater رد شد");
  }
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
  if (!hashRe.test(xml)) die("کلید ElectronAsarIntegrity در Info.plist پیدا نشد");
  xml = xml.replace(hashRe, (_m, a, _old, c) => a + newHeaderHash + c);

  /* نام نمایشی اپ (بدون پسوند .app) */
  const appBaseName = path.basename(OUT_APP).replace(/\.app$/i, "");
  const setKey = (key, value, required) => {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
    if (re.test(xml)) {
      xml = xml.replace(re, (_m, a, _old, c) => a + value + c);
      return true;
    }
    if (required) die(`کلید ${key} در Info.plist پیدا نشد`);
    return false;
  };

  setKey("CFBundleName", appBaseName, true);
  setKey("CFBundleDisplayName", appBaseName, false);

  fs.writeFileSync(plistPath, xml);

  const check = fs.readFileSync(plistPath, "utf8");
  if (!check.includes(newHeaderHash)) die("نوشتن هش در Info.plist تأیید نشد");
  log(`Info.plist به‌روزرسانی شد — CFBundleName=${appBaseName}`);
}

/* ---------------------- helper apps ---------------------- */
/**
 * Electron 43 (shell/app/electron_main_delegate_mac.mm):
 *   helper_path = Frameworks/<name> Helper<SUF>.app/Contents/MacOS/<name> Helper<SUF>
 * ابتدا با ELECTRON_PRODUCT_NAME («Kimi») و در صورت نبودِ مسیر با
 * GetApplicationName() (= CFBundleName = «Kimi RTL») تلاش می‌شود.
 * چون PathExists روی *خود فایل اجرایی* چک می‌شود، rename پوشه کافی نیست.
 */
function stepRenameHelpers() {
  const fw = path.join(OUT_APP, "Contents", "Frameworks");
  const newBase = path.basename(OUT_APP).replace(/\.app$/i, "");
  const oldBase = "Kimi";

  for (const suf of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
    const oldApp = `${oldBase} Helper${suf}.app`;
    const newApp = `${newBase} Helper${suf}.app`;
    const from = path.join(fw, oldApp);
    const to = path.join(fw, newApp);

    if (fs.existsSync(from)) {
      fs.renameSync(from, to);
      log(`helper app: ${oldApp} → ${newApp}`);
    } else if (fs.existsSync(to)) {
      log(`helper app: ${newApp} (از قبل موجود)`);
    } else {
      warn(`helper app پیدا نشد: ${oldApp}`);
      continue;
    }

    const oldExe = `${oldBase} Helper${suf}`;
    const newExe = `${newBase} Helper${suf}`;
    const macosDir = path.join(to, "Contents", "MacOS");
    const exeFrom = path.join(macosDir, oldExe);
    const exeTo = path.join(macosDir, newExe);

    if (fs.existsSync(exeFrom)) {
      fs.renameSync(exeFrom, exeTo);
      log(`  exe: ${oldExe} → ${newExe}`);
    } else if (fs.existsSync(exeTo)) {
      log(`  exe: ${newExe} (از قبل موجود)`);
    } else {
      die(`فایل اجرایی helper پیدا نشد: ${exeFrom}`);
    }

    const hplist = path.join(to, "Contents", "Info.plist");
    if (fs.existsSync(hplist)) {
      let x = fs.readFileSync(hplist, "utf8");
      if (x.includes(oldExe)) {
        x = x.split(oldExe).join(newExe);
        fs.writeFileSync(hplist, x);
        log("  plist helper به‌روزرسانی شد");
      }
    }
  }
}

/* ---------------------- codesign ---------------------- */
function stepCodesign() {
  log("امضای مجدد ad-hoc …");
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", OUT_APP], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", OUT_APP], { stdio: "inherit" });
  log("امضا معتبر است ✓");
}

/* ============================ اجرا ============================ */
try {
  log(`=== Kimi RTL Patcher — منبع: ${SRC_APP} ===`);
  if (process.platform !== "darwin") die("این اسکریپت فقط روی macOS پشتیبانی می‌شود.");
  if (!fs.existsSync(SRC_APP)) die(`اپ منبع پیدا نشد: ${SRC_APP}`);

  stepClone();
  const { newHeaderHash } = stepPatchAsar();
  stepUpdatePlist(newHeaderHash);
  stepRenameHelpers();
  stepDisableUpdater();
  stepCodesign();

  log(`✅ تمام شد: ${OUT_APP}`);
  log(`اجرا:  open "${OUT_APP}"`);
} catch (err) {
  die(err && err.stack ? err.stack : String(err));
}
