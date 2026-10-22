#!/bin/bash
# Cursor-RTL patcher — v1.0 (Cursor 3.26.x)
#
# از نسخهٔ نصب‌شدهٔ Cursor یک کپی مستقل می‌سازد و آن را RTL می‌کند:
#   /Applications/Cursor.app  →  /Applications/Cursor-RTL.app
#
# تغییرات:
#   - فونت Vazirmatn برای متن فارسی
#   - هر پاراگراف/آیتم/تیتر/نقل‌قول/سلول جدولی که حتی یک حرف فارسی دارد
#     کامل RTL می‌شود، حتی اگر با انگلیسی/عدد/علائم شروع شده باشد
#   - چت ایجنت، حباب کاربر، ورودی ProseMirror و Markdown پوشش داده می‌شود
#   - کد، Monaco، ترمینال و فرمول همیشه LTR و monospace می‌مانند
#   - منو/سایدبار/تنظیمات در این نسخه دست‌نخورده می‌مانند
#
# استفاده:
#   bash patch-cursor-rtl.sh
# متغیرهای اختیاری:
#   CURSOR_SRC=/Applications/Cursor.app
#   CURSOR_DST=/Applications/Cursor-RTL.app
#
# قابل اجرای مجدد: پس از هر آپدیت Cursor، دوباره اجرا کنید.
# بازگشت: حذف Cursor-RTL.app هیچ اثری بر Cursor اصلی ندارد.
set -euo pipefail

SRC="${CURSOR_SRC:-/Applications/Cursor.app}"
DST="${CURSOR_DST:-/Applications/Cursor-RTL.app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CSS="$SCRIPT_DIR/rtl-fa.css"
JS="$SCRIPT_DIR/rtl-fa.js"
F_REG="$SCRIPT_DIR/vazirmatn-regular.woff2"
F_MED="$SCRIPT_DIR/vazirmatn-medium.woff2"
F_BOLD="$SCRIPT_DIR/vazirmatn-bold.woff2"
OFL="$SCRIPT_DIR/OFL.txt"

OUT_ID="com.todesktop.230313mzl4w4u92.rtl"
EXPECTED_SRC_ID="com.todesktop.230313mzl4w4u92"
PATCH_VERSION="1.0.1"

log() { printf '==> %s\n' "$*"; }
fail() { printf 'خطا: %s\n' "$*" >&2; exit 1; }

command -v ditto >/dev/null || fail "ditto یافت نشد."
command -v python3 >/dev/null || fail "python3 یافت نشد."
command -v plutil >/dev/null || fail "plutil یافت نشد."
command -v codesign >/dev/null || fail "codesign یافت نشد."
command -v node >/dev/null || fail "node یافت نشد."
command -v pgrep >/dev/null || fail "pgrep یافت نشد."

[ -d "$SRC" ] || fail "نسخهٔ اصلی Cursor یافت نشد: $SRC"
[ -f "$SRC/Contents/Info.plist" ] || fail "Info.plist در نسخهٔ اصلی یافت نشد."
[ -f "$SRC/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html" ] \
  || fail "workbench.html در نسخهٔ اصلی یافت نشد؛ ساختار Cursor تغییر کرده است."
[ -f "$SRC/Contents/Resources/app/product.json" ] \
  || fail "product.json در نسخهٔ اصلی یافت نشد؛ ساختار Cursor تغییر کرده است."

for file in "$CSS" "$JS" "$F_REG" "$F_MED" "$F_BOLD" "$OFL"; do
  [ -f "$file" ] || fail "فایل پیلود یافت نشد: $file"
done

node --check "$JS" >/dev/null 2>&1 || fail "خطای نحوی در rtl-fa.js"

SRC_ID="$(plutil -extract CFBundleIdentifier raw -o - "$SRC/Contents/Info.plist" 2>/dev/null || true)"
[ "$SRC_ID" = "$EXPECTED_SRC_ID" ] \
  || fail "bundle ID غیرمنتظره است: ${SRC_ID:-?} (انتظار: $EXPECTED_SRC_ID)"
SRC_VER="$(plutil -extract CFBundleShortVersionString raw -o - "$SRC/Contents/Info.plist" 2>/dev/null || echo '?')"

if pgrep -f "$SRC/Contents/MacOS/Cursor" >/dev/null 2>&1; then
  fail "Cursor در حال اجراست؛ اول آن را کامل ببندید و دوباره اجرا کنید."
fi
if pgrep -f "$DST/Contents/MacOS/Cursor" >/dev/null 2>&1; then
  fail "Cursor-RTL در حال اجراست؛ اول آن را ببندید."
fi

log "نسخهٔ مبدأ: $SRC_VER"
log "حذف خروجی قبلی (در صورت وجود): $DST"
rm -rf "$DST"

log "کپی $SRC → $DST"
ditto "$SRC" "$DST"
[ -d "$DST" ] || fail "کپی ناموفق بود."

APP_RES="$DST/Contents/Resources/app"
WB="$APP_RES/out/vs/code/electron-sandbox/workbench"
PRODUCT="$APP_RES/product.json"
PLIST="$DST/Contents/Info.plist"

[ -f "$WB/workbench.html" ] || fail "workbench.html در خروجی یافت نشد."
[ -f "$PRODUCT" ] || fail "product.json در خروجی یافت نشد."

log "افزودن فایل‌های RTL و فونت‌ها ..."
install -d "$WB/assets"
install -m 0644 "$CSS" "$WB/rtl-fa.css"
install -m 0644 "$JS" "$WB/rtl-fa.js"
install -m 0644 "$F_REG" "$WB/assets/vazirmatn-regular.woff2"
install -m 0644 "$F_MED" "$WB/assets/vazirmatn-medium.woff2"
install -m 0644 "$F_BOLD" "$WB/assets/vazirmatn-bold.woff2"
install -m 0644 "$OFL" "$WB/assets/OFL.txt"

log "به‌روزرسانی Info.plist ..."
plutil -replace CFBundleIdentifier -string "$OUT_ID" "$PLIST"
plutil -replace CFBundleDisplayName -string "Cursor-RTL" "$PLIST"
# CFBundleName عمداً تغییر نمی‌کند: Electron هلپرها را با
# "<CFBundleName> Helper.app" پیدا می‌کند و تغییرش باعث کرش می‌شود.
[ "$(plutil -extract CFBundleName raw -o - "$PLIST" 2>/dev/null || true)" = "Cursor" ] \
  || fail "CFBundleName باید Cursor بماند (هلپرهای Electron)."

log "تزریق CSS/JS به workbench.html ..."
python3 - "$WB/workbench.html" <<'PY'
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    html = f.read()

if "rtl-fa.css" not in html:
    marker = "</head>"
    if html.count(marker) != 1:
        raise SystemExit("anchor </head> not found exactly once")
    html = html.replace(
        marker,
        '\t\t<!-- Cursor RTL -->\n'
        '\t\t<link rel="stylesheet" href="./rtl-fa.css">\n'
        "\t</head>",
        1,
    )

if "rtl-fa.js" not in html:
    marker = "<!-- Startup (do not modify order of script tags!) -->"
    if html.count(marker) != 1:
        raise SystemExit("startup script anchor not found exactly once")
    html = html.replace(
        marker,
        '\t<!-- Cursor RTL -->\n'
        '\t<script src="./rtl-fa.js"></script>\n\n'
        "\t" + marker,
        1,
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(html)
PY

grep -q 'rtl-fa.css' "$WB/workbench.html" || fail "تزریق CSS انجام نشد."
grep -q 'rtl-fa.js' "$WB/workbench.html" || fail "تزریق JS انجام نشد."

log "به‌روزرسانی product.json (چک‌سام workbench.html و خاموش‌کردن آپدیت خودکار) ..."
python3 - "$PRODUCT" "$WB/workbench.html" <<'PY'
import base64
import hashlib
import json
import sys

product_path, html_path = sys.argv[1], sys.argv[2]
with open(html_path, "rb") as f:
    digest = base64.b64encode(hashlib.sha256(f.read()).digest()).decode().rstrip("=")

with open(product_path, "r", encoding="utf-8") as f:
    product = json.load(f)

checks = product.get("checksums")
key = "vs/code/electron-sandbox/workbench/workbench.html"
if isinstance(checks, dict) and key in checks:
    checks[key] = digest
    print("checksum updated:", digest)
else:
    print("warning: checksum key not found; leaving checksums untouched")

if "updateUrl" in product:
    product["updateUrl"] = ""
else:
    print("warning: updateUrl key not found")
if "backupUpdateUrl" in product:
    product["backupUpdateUrl"] = ""
else:
    print("warning: backupUpdateUrl key not found")

with open(product_path, "w", encoding="utf-8") as f:
    json.dump(product, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY

python3 - "$PRODUCT" "$WB/workbench.html" <<'PY'
import base64
import hashlib
import json
import sys

product_path, html_path = sys.argv[1], sys.argv[2]
with open(html_path, "rb") as f:
    digest = base64.b64encode(hashlib.sha256(f.read()).digest()).decode().rstrip("=")
with open(product_path, "r", encoding="utf-8") as f:
    product = json.load(f)
key = "vs/code/electron-sandbox/workbench/workbench.html"
if isinstance(product.get("checksums"), dict) and key in product["checksums"]:
    if product["checksums"][key] != digest:
        raise SystemExit("checksum verification failed")
    print("checksum verified:", digest)
else:
    print("warning: checksum key unavailable for verification")
PY

log "نوشتن متادیتای پچ ..."
cat > "$DST/Contents/Resources/.cursor-rtl-patch.json" <<EOF
{
  "patch": "cursor-rtl",
  "patchVersion": "$PATCH_VERSION",
  "sourceApp": "$SRC",
  "sourceVersion": "$SRC_VER",
  "outputBundleId": "$OUT_ID",
  "patchedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "امضای مجدد (ad-hoc، با حفظ entitlements و بدون hardened runtime) ..."
# چرا flags/runtime حفظ نمی‌شود؟ hardened runtime قابلیت Library Validation
# را روشن می‌کند که要求 می‌کند همهٔ فریم‌ورک‌ها Team ID یکسان با باینری اصلی
# داشته باشند؛ امضای ad-hoc هیچ Team ID ندارد و dyld در استارت با خطای
# «different Team IDs» می‌میرد. بدون runtime ‏(flags=0x2) برنامه بالا می‌آید
# و entitlements اصلی (مثل allow-jit برای V8) حفظ می‌شود.
codesign --force --deep --sign - \
  --preserve-metadata=entitlements "$DST"
xattr -cr "$DST" 2>/dev/null || true

log "راستی‌آزمایی ..."
codesign --verify --deep --strict "$DST"
[ "$(plutil -extract CFBundleIdentifier raw -o - "$PLIST")" = "$OUT_ID" ] \
  || fail "bundle ID خروجی درست نیست."
[ "$(plutil -extract CFBundleDisplayName raw -o - "$PLIST")" = "Cursor-RTL" ] \
  || fail "CFBundleDisplayName درست نیست."
[ "$(plutil -extract CFBundleName raw -o - "$PLIST")" = "Cursor" ] \
  || fail "CFBundleName نباید تغییر کند."
[ -f "$WB/rtl-fa.css" ] && [ -f "$WB/rtl-fa.js" ] \
  || fail "فایل‌های RTL در خروجی نیستند."
[ -f "$WB/assets/vazirmatn-regular.woff2" ] \
  || fail "فونت Vazirmatn در خروجی نیست."
grep -q 'rtl-fa.css' "$WB/workbench.html" || fail "لینک CSS در HTML نیست."
grep -q 'rtl-fa.js' "$WB/workbench.html" || fail "اسکریپت JS در HTML نیست."

printf '\nتمام شد. نسخهٔ RTL ساخته شد:\n  %s\n\n' "$DST"
printf 'اجرا:\n  open "%s"\n\n' "$DST"
printf 'هشدار: پروفایل Cursor مشترک است؛ Cursor اصلی و Cursor-RTL را هم‌زمان اجرا نکنید.\n'
printf 'هشدار: آپدیت خودکار خاموش شده است؛ برای آپدیت، Cursor اصلی را آپدیت و دوباره build کنید.\n'
