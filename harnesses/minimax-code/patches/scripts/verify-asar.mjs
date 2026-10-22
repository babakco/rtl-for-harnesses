#!/usr/bin/env node
/**
 * verify-asar.mjs — بازبینی یکپارچگی نسخهٔ RTL
 *
 * استفاده: node patches/scripts/verify-asar.mjs "/Applications/MiniMax Code-RTL.app"
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const OUT_APP = process.argv[2] || "/Applications/MiniMax Code-RTL.app";
const asarPath = path.join(OUT_APP, "Contents", "Resources", "app.asar");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.error(`  ✗ ${m}`);
  failures++;
};
const warn = (m) => console.warn(`  ! ${m}`);

console.log(`\n=== بازبینی: ${OUT_APP} ===\n`);

/* ---------- ۱) ساختار asar ---------- */
if (!fs.existsSync(asarPath)) {
  bad(`app.asar پیدا نشد: ${asarPath}`);
  process.exit(1);
}
const buf = fs.readFileSync(asarPath);
const jsonLen = buf.readUInt32LE(12);
const headerRegion = buf.readUInt32LE(4);
const headerSize = 8 + headerRegion;
const jsonBuf = buf.subarray(16, 16 + jsonLen);
const header = JSON.parse(jsonBuf.toString("utf8"));

const getNode = (p) => {
  let node = header;
  for (const seg of p.split("/").filter(Boolean)) {
    if (!node.files || !node.files[seg]) return null;
    node = node.files[seg];
  }
  return node;
};
const readAsar = (p) => {
  const node = getNode(p);
  if (!node || node.files) return null;
  const off = headerSize + Number(node.offset);
  return buf.subarray(off, off + node.size);
};

console.log("۱) ساختار asar");
ok(`asar: ${(buf.length / 1048576).toFixed(1)} MB | هدر: ${headerSize} بایت`);

/* ---------- ۲) تطابق هش هدر با Info.plist ---------- */
console.log("\n۲) تطابق ElectronAsarIntegrity");
const plistPath = path.join(OUT_APP, "Contents", "Info.plist");
const xml = fs.readFileSync(plistPath, "utf8");
const m = /ElectronAsarIntegrity[\s\S]*?<key>hash<\/key>\s*<string>([0-9a-fA-F]{64})<\/string>/.exec(xml);
const headerHash = sha256(jsonBuf);
if (!m) {
  warn("کلید ElectronAsarIntegrity در Info.plist پیدا نشد");
} else if (m[1] === headerHash) {
  ok(`هش هدر asar با Info.plist مطابق است (${headerHash.slice(0, 16)}…)`);
} else {
  bad(`هش هدر asar (${headerHash.slice(0, 16)}…) با Info.plist (${m[1].slice(0, 16)}…) فرق دارد`);
}

/* ---------- ۳) فایل‌های پچ‌شده ---------- */
console.log("\n۳) فایل‌های پچ‌شده");
const expectations = [
  ["dist/main/preload.js", "MINIMAX_RTL_CSS", "قلاب preload"],
  ["dist/main/model-menu-preload.js", "MINIMAX_RTL_CSS", "قلاب preload پاپ‌آپ مدل"],
  ["dist/main/index.js", "MINIMAX_RTL_USERDATA", "جداسازی userData"],
  ["dist/main/modules/hotUpdate/config.js", "MINIMAX_RTL_NO_HOT_UPDATE", "غیرفعال‌سازی hot-update"]
];
for (const [rel, needle, label] of expectations) {
  const content = readAsar(rel);
  if (!content) {
    bad(`${label}: فایل ${rel} پیدا نشد`);
    continue;
  }
  if (content.toString("utf8").includes(needle)) ok(`${label} ✓ (${rel})`);
  else bad(`${label}: نشانهٔ «${needle}» در ${rel} پیدا نشد`);
}

/* ---------- ۴) فایل‌های اضافه‌شده ---------- */
console.log("\n۴) دارایی‌های RTL");
const added = [
  "out/minimax-rtl/rtl.css",
  "out/minimax-rtl/rtl-autodir.js",
  "out/pdf/minimax-rtl/rtl.css",
  "out/pdf/minimax-rtl/rtl-autodir.js",
  "dist/model-menu/minimax-rtl/rtl.css",
  "dist/model-menu/minimax-rtl/rtl-autodir.js"
];
for (const rel of added) {
  const content = readAsar(rel);
  if (!content) bad(`فایل اضافه‌شده پیدا نشد: ${rel}`);
  else ok(`${rel} (${(content.length / 1024).toFixed(1)} KB)`);
}

/* فونت‌ها */
const fontDir = getNode("out/minimax-rtl/fonts");
if (!fontDir || !fontDir.files) {
  bad("پوشهٔ فونت out/minimax-rtl/fonts پیدا نشد");
} else {
  const names = Object.keys(fontDir.files);
  if (names.length === 0) bad("پوشهٔ فونت خالی است");
  else ok(`فونت‌ها: ${names.join(", ")}`);
}

/* ---------- ۴-ب) تطابق بایت‌به‌بایت با منبع ----------
   تضمین می‌کند که فایلی که داخل اپ تزریق شده دقیقاً همان فایلی است که
   در tests/fixture.html تست شده (نه یک نسخهٔ قدیمی یا ویرایش‌نشده). */
console.log("\n۴-ب) تطابق بایت‌به‌بایت با منبع پچ");
const PATCH_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePairs = [
  ["out/minimax-rtl/rtl.css", path.join(PATCH_ROOT, "rtl.css")],
  ["out/minimax-rtl/rtl-autodir.js", path.join(PATCH_ROOT, "rtl-autodir.js")]
];
for (const [rel, srcPath] of sourcePairs) {
  const shipped = readAsar(rel);
  if (!shipped) {
    bad(`فایل داخل asar پیدا نشد: ${rel}`);
    continue;
  }
  if (!fs.existsSync(srcPath)) {
    warn(`منبع پیدا نشد (بازبینی از بیرون مخزن اجرا شده): ${srcPath}`);
    continue;
  }
  const src = fs.readFileSync(srcPath);
  if (src.equals(shipped)) {
    ok(`${rel} با منبع یکسان است (sha256 ${sha256(src).slice(0, 12)}…)`);
  } else {
    bad(`${rel} با منبع متفاوت است — پچر باید دوباره اجرا شود`);
  }
}

/* ---------- ۵) تزریق HTML ---------- */
console.log("\n۵) تزریق در صفحه‌ها");
let htmlChecked = 0;
let htmlOk = 0;
const walkHtml = (node, prefix) => {
  for (const [name, d] of Object.entries(node.files || {})) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (d.files) {
      walkHtml(d, rel);
      continue;
    }
    if (!rel.startsWith("out/") || !name.endsWith(".html")) continue;
    const content = readAsar(rel);
    if (!content) continue;
    htmlChecked++;
    const t = content.toString("utf8");
    if (t.includes("data-minimax-rtl-asset")) htmlOk++;
    else bad(`تزریق نشده: ${rel}`);
  }
};
walkHtml(header, "");
if (htmlChecked > 0) ok(`${htmlOk}/${htmlChecked} صفحهٔ رندرر تزریق شد`);

/* ---------- ۶) ورودی HTML معتبر است؟ ---------- */
console.log("\n۶) صحت HTML");
const sample = readAsar("out/archon/index.html");
if (sample) {
  const t = sample.toString("utf8");
  const opens = (t.match(/<link\b/gi) || []).length;
  const closes = (t.match(/<\/head>/gi) || []).length;
  if (closes === 1 && opens > 0) ok("ساختار head سالم است");
  else bad(`ساختار HTML مشکوک است (head بسته: ${closes})`);
}

/* ---------- ۷) نام‌ها و updater ---------- */
console.log("\n۷) نام اپ و بروزرسانی");
const disp = /<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/.exec(xml);
if (disp) ok(`CFBundleDisplayName = ${disp[1]}`);
else bad("CFBundleDisplayName پیدا نشد");

const updaterDisabled = fs.existsSync(
  path.join(OUT_APP, "Contents", "Resources", "app-update.yml.minimax-rtl-disabled")
);
const updaterPresent = fs.existsSync(path.join(OUT_APP, "Contents", "Resources", "app-update.yml"));
if (updaterDisabled) ok("auto-updater غیرفعال است");
else if (updaterPresent) bad("auto-updater هنوز فعال است");
else warn("app-update.yml پیدا نشد");

/* ---------- ۸) امضا ---------- */
console.log("\n۸) امضای کد");
try {
  const { execFileSync } = await import("node:child_process");
  execFileSync("codesign", ["--verify", "--deep", "--strict", OUT_APP], { stdio: "pipe" });
  ok("امضای ad-hoc معتبر است");
} catch (e) {
  bad(`امضا معتبر نیست: ${e.message}`);
}

/* ---------- ۹) PATCH-INFO ---------- */
console.log("\n۹) فرادادهٔ پچ");
const info = readAsar("minimax-rtl/PATCH-INFO.json");
if (info) {
  const parsed = JSON.parse(info.toString("utf8"));
  ok(`patchedAt=${parsed.patchedAt} | sourceVersion=${parsed.sourceVersion}`);
} else {
  bad("PATCH-INFO.json پیدا نشد");
}

/* ---------- نتیجه ---------- */
console.log("");
if (failures === 0) {
  console.log("✅ همهٔ بررسی‌ها موفق بودند.");
  process.exit(0);
} else {
  console.error(`❌ ${failures} مورد ناموفق.`);
  process.exit(1);
}
