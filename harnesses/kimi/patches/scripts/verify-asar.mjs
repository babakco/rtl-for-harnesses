#!/usr/bin/env node
/**
 * verify-asar.mjs — بازبینی یکپارچگی باندل پچ‌شده
 *
 * چه چیزهایی چک می‌شود؟
 *   ۱) SHA256 هدر asar با مقدار ElectronAsarIntegrity در Info.plist یکی است
 *   ۲) برای هر فایل داخل asar، hash و blocks با محتوای واقعی می‌خواند
 *      (همان چیزی که Electron در asar_util.cc چک می‌کند)
 *   ۳) فایل‌های پرچم‌خوردهٔ unpacked در app.asar.unpacked موجودند
 *   ۴) فایل‌های پچ و تزریق‌ها سرجای خود هستند
 *
 * استفاده:
 *   node patches/scripts/verify-asar.mjs ["/Applications/Kimi RTL.app"]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const app = process.argv[2] || "/Applications/Kimi RTL.app";
const asarPath = path.join(app, "Contents", "Resources", "app.asar");
const plistPath = path.join(app, "Contents", "Info.plist");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failures++; console.log(`  ❌ ${m}`); };

if (!fs.existsSync(asarPath)) {
  console.error(`asar پیدا نشد: ${asarPath}`);
  process.exit(1);
}

console.log(`\nبازبینی: ${app}\n`);

const buf = fs.readFileSync(asarPath);
const jsonLen = buf.readUInt32LE(12);
const headerRegionSize = buf.readUInt32LE(4);
const headerSize = 8 + headerRegionSize;
const jsonBuf = buf.subarray(16, 16 + jsonLen);
const header = JSON.parse(jsonBuf.toString("utf8"));

/* ---------- ۱) هش هدر ---------- */
console.log("[1] هش هدر asar");
const headerHash = sha256(jsonBuf);
const plistXml = fs.readFileSync(plistPath, "utf8");
const m = /ElectronAsarIntegrity[\s\S]*?<key>hash<\/key>\s*<string>([0-9a-fA-F]{64})<\/string>/.exec(plistXml);
if (!m) bad("ElectronAsarIntegrity در Info.plist پیدا نشد");
else if (m[1].toLowerCase() !== headerHash) bad(`plist=${m[1]}  asar=${headerHash}`);
else ok(`هدر مطابق plist (${headerHash.slice(0, 16)}…)`);

/* ---------- ۲) integrity همهٔ فایل‌ها ---------- */
console.log("[2] integrity فایل‌های داخل asar");
let files = 0, missing = 0, wrong = 0, unpackedMissing = 0;
const BLOCK_FALLBACK = 4194304;

const walk = (node, prefix) => {
  for (const name of Object.keys(node.files || {})) {
    const f = node.files[name];
    const p = `${prefix}/${name}`;
    if (f.files) { walk(f, p); continue; }
    files++;
    if (!f.integrity) {
      missing++;
      const real = path.join(app, "Contents", "Resources", "app.asar.unpacked", p);
      if (f.unpacked && !fs.existsSync(real)) unpackedMissing++;
      continue;
    }
    if (f.unpacked) {
      const real = path.join(app, "Contents", "Resources", "app.asar.unpacked", p);
      if (!fs.existsSync(real)) unpackedMissing++;
      continue;
    }
    const off = headerSize + Number(f.offset);
    const content = buf.subarray(off, off + f.size);
    if (content.length !== f.size) { wrong++; continue; }
    if (sha256(content) !== f.integrity.hash) { wrong++; continue; }
    const bs = f.integrity.blockSize || BLOCK_FALLBACK;
    for (let i = 0, k = 0; i < content.length; i += bs, k++) {
      const blk = sha256(content.subarray(i, Math.min(i + bs, content.length)));
      if (f.integrity.blocks && f.integrity.blocks[k] && f.integrity.blocks[k] !== blk) { wrong++; break; }
    }
  }
};
walk(header, "");

files > 0 ? ok(`${files} فایل بررسی شد`) : bad("هیچ فایلی پیدا نشد");
missing === 0 ? ok("همهٔ فایل‌ها بلوک integrity دارند") : bad(`${missing} فایل بدون integrity`);
wrong === 0 ? ok("همهٔ hash/blockها درست هستند") : bad(`${wrong} فایل با محتوای ناهمخوان`);
unpackedMissing === 0 ? ok("فایل‌های unpacked در app.asar.unpacked موجودند") : bad(`${unpackedMissing} فایل unpacked گم‌شده`);

/* ---------- ۳) تزریق‌ها ---------- */
console.log("[3] تزریق‌های پچ");
const get = (p) => p.split("/").filter(Boolean).reduce((n, s) => (n && n.files ? n.files[s] : null), header);
const read = (p) => {
  const n = get(p);
  if (!n || n.files) return null;
  const off = headerSize + Number(n.offset);
  return buf.subarray(off, off + n.size).toString("utf8");
};

const main = read("out/main/index.js");
main && main.startsWith('import "../../kimi-rtl/rtl-main-bootstrap.mjs";')
  ? ok("out/main/index.js → bootstrap تزریق شده")
  : bad("out/main/index.js تزریق نشده");

for (const f of ["rtl-main-bootstrap.mjs", "rtl-preload.cjs", "rtl-preload.mjs", "rtl-autodir.js", "rtl-inline.css"]) {
  get(`kimi-rtl/${f}`) ? ok(`kimi-rtl/${f} موجود است`) : bad(`kimi-rtl/${f} گم‌شده`);
}

let hooked = 0;
for (const name of Object.keys((get("out/preload") || {}).files || {})) {
  const t = read(`out/preload/${name}`);
  if (t && t.includes("kimi-rtl/rtl-preload")) hooked++;
}
hooked >= 5 ? ok(`${hooked} preload اپ تزریق شده`) : bad(`فقط ${hooked} preload تزریق شده`);

fs.existsSync(path.join(app, "Contents", "Resources", "app-update.yml.kimi-rtl-disabled"))
  ? ok("auto-updater غیرفعال شده")
  : bad("app-update.yml غیرفعال نشده");

console.log(failures === 0 ? "\nنتیجه: همهٔ بازبینی‌ها موفق ✅\n" : `\nنتیجه: ${failures} خطا ❌\n`);
process.exit(failures === 0 ? 0 : 1);
