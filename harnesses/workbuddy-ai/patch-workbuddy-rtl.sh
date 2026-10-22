#!/bin/bash
# ============================================================================
# patch-workbuddy-rtl.sh — ساخت نسخه RTL نرم‌افزار WorkBuddy AI
#
#  ۱) از نسخه اصلی در پوشه Applications یک کپی با پسوند RTL می‌سازد:
#         /Applications/WorkBuddy AI.app  →  /Applications/WorkBuddy AI RTL.app
#  ۲) آن کپی را پچ می‌کند (نسخه اصلی دست نخورده می‌ماند):
#       - فونت نوشتار کاربر و نمایش پاسخ مدل: Vazirmatn
#       - هر پاراگراف/جمله‌ای که حتی یک کاراکتر فارسی داشته باشد
#         (حتی با شروع انگلیسی یا علائم) کاملاً RTL نمایش داده می‌شود
#         (U+FEFF/BOM فارسی حساب نمی‌شود تا انگلیسی خالص LTR بماند)
#       - پوشش همه بخش‌ها: گفت‌وگو، سایدبار، نمایش فایل، چندگزینه‌ای،
#         پیش‌نمایش markdown فایل‌های باز (iframe مهمان) و…
#       - پاراگراف/اسپن کاملاً انگلیسی همیشه LTR می‌ماند، حتی زیر جد فارسی
#       - بلاک کد/ترمینال/فرمول همیشه LTR می‌ماند
#
# استفاده:
#   ./patch-workbuddy-rtl.sh
# متغیرهای اختیاری:
#   WORKBUDDY_SRC   مسیر نسخه اصلی (پیش‌فرض: /Applications/WorkBuddy AI.app)
#   WORKBUDDY_DST   مسیر نسخه RTL   (پیش‌فرض: /Applications/WorkBuddy AI RTL.app)
#
# قابل اجرای مجدد: با هر به‌روزرسانی WorkBuddy، دوباره اجرا کنید تا نسخه
# RTL تازه از روی نسخه اصلی ساخته شود.
# بازگشت: برای حذف، کافی است نسخه RTL را به سطل زباله منتقل کنید.
# ============================================================================
set -euo pipefail

SRC="${WORKBUDDY_SRC:-/Applications/WorkBuddy AI.app}"
DST="${WORKBUDDY_DST:-/Applications/WorkBuddy AI RTL.app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSS="$SCRIPT_DIR/workbuddy-rtl.css"
JS="$SCRIPT_DIR/workbuddy-rtl.js"
INJECT="$SCRIPT_DIR/inject-asar.js"
RTL_NAME="WorkBuddy AI RTL"

log() { printf '==> %s\n' "$*"; }
fail() { printf 'خطا: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || fail "node یافت نشد."
command -v codesign >/dev/null || fail "codesign یافت نشد."
[ -d "$SRC" ] || fail "نسخه اصلی یافت نشد: $SRC"
[ -f "$CSS" ] || fail "فایل پیلود یافت نشد: $CSS"
[ -f "$JS" ] || fail "فایل پیلود یافت نشد: $JS"
[ -f "$INJECT" ] || fail "اسکریپت تزریق یافت نشد: $INJECT"
node --check "$JS" || fail "خطای نحوی در $JS"

SRC_ASAR="$SRC/Contents/Resources/app.asar"
[ -f "$SRC_ASAR" ] || fail "app.asar یافت نشد: $SRC_ASAR"
SRC_VER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$SRC/Contents/Info.plist" 2>/dev/null || echo unknown)"
ASAR_BEFORE="$(shasum -a 256 "$SRC_ASAR" | awk '{print $1}')"
PAYLOAD_SHA="$(cat "$CSS" "$JS" | shasum -a 256 | awk '{print $1}')"
log "نسخه مبدأ: $SRC_VER"

# ---- ۱) کپی با پسوند RTL در همان پوشه ----
if [ -e "$DST" ]; then
  log "حذف نسخه RTL قبلی: $DST"
  rm -rf "$DST"
fi
log "کپی $SRC → $DST"
ditto "$SRC" "$DST"
[ -d "$DST" ] || fail "کپی ناموفق بود."

# ---- ۲) تنظیم Info.plist نسخه RTL ----
PLIST="$DST/Contents/Info.plist"
# NOTE: CFBundleName را تغییر نمی‌دهیم؛ Electron هلپرها را با الگوی
# "<CFBundleName> Helper.app" پیدا می‌کند و تغییر آن باعث
# FATAL «Unable to find helper app» در استارت می‌شود.
# فقط CFBundleDisplayName (نمایشی در Finder/Dock) متمایز می‌شود.
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $RTL_NAME" "$PLIST"
# NOTE: کلید ElectronAsarIntegrity را حذف نمی‌کنیم؛ Electron با فیوز
# EnableEmbeddedAsarIntegrityValidation در غیاب آن trap می‌کند.
# هش app.asar پس از تزریق (مرحله ۳) دوباره محاسبه و ثبت می‌شود.
log "Info.plist به‌روزرسانی شد (نام؛ هش asar پس از تزریق ثبت می‌شود)."

# ---- ۳) تزریق جراحی به app.asar (بدون اکسترکت کامل) ----
log "تزریق Vazirmatn + RTL به app.asar ..."
INJECT_OUT="$(node "$INJECT" "$DST/Contents/Resources/app.asar" "$CSS" "$JS")"
echo "$INJECT_OUT"
# ElectronAsarIntegrity = هش SHA256 بایت‌های JSON هدر asar (نه کل فایل)؛
# injector آن را در هر دو حالت (patched / already-patched) چاپ می‌کند.
HEADER_HASH="$(echo "$INJECT_OUT" | node -e "let s='';process.stdin.on('data',function(d){s+=d}).on('end',function(){console.log(JSON.parse(s).headerJsonSha256)})")"
[ -n "${HEADER_HASH:-}" ] || fail "هش هدر asar به دست نیامد."
ASAR_AFTER="$(shasum -a 256 "$DST/Contents/Resources/app.asar" | awk '{print $1}')"

# ---- ۳-ب) ثبت هش جدید هدر asar در Info.plist (الگوی پچ‌های RTL قبلی) ----
if /usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$PLIST" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash $HEADER_HASH" "$PLIST"
  log "هش جدید هدر app.asar در Info.plist ثبت شد."
else
  log "هشدار: کلید ElectronAsarIntegrity در نسخه اصلی نبود؛ چیزی ثبت نشد."
fi

# ---- ۴) ثبت متادیتای پچ (داخل Resources تا seal امضا نشکند) ----
cat > "$DST/Contents/Resources/.workbuddy-rtl-patch.json" <<EOF
{
  "patch": "workbuddy-rtl",
  "patchVersion": "1.5.0",
  "sourceApp": "$SRC",
  "sourceVersion": "$SRC_VER",
  "asarSha256Before": "$ASAR_BEFORE",
  "asarSha256After": "$ASAR_AFTER",
  "asarHeaderJsonSha256": "$HEADER_HASH",
  "payloadSha256": "$PAYLOAD_SHA",
  "patchedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# ---- ۵) امضای ad-hoc با حفظ entitlements اصلی (allow-jit و…) ----
# بدون preserve-metadata، امضای ad-hoc همه entitlements را پاک می‌کند و
# V8 در لحظه استارت با EXC_BREAKPOINT کرش می‌کند.
log "امضای مجدد (ad-hoc، با حفظ entitlements) ..."
codesign --force --deep --sign - --preserve-metadata=entitlements,flags,runtime "$DST"
xattr -cr "$DST" || true

# ---- ۶) راستی‌آزمایی ----
log "راستی‌آزمایی ..."
codesign --verify --deep "$DST"
[ -f "$DST/Contents/Resources/app.asar" ] || fail "app.asar پس از پچ موجود نیست."
/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST" | grep -q "RTL" || fail "نام RTL در Info.plist ثبت نشد."
/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST" | grep -qx "WorkBuddy AI" || fail "CFBundleName نباید تغییر کند (هلپرها)."

echo ""
echo "تمام شد. نسخه RTL ساخته شد:"
echo "  $DST"
echo ""
echo "اجرا با دستور:"
echo "  open -a \"$RTL_NAME\""
echo "بازگشت: حذف نسخه RTL هیچ اثری بر نسخه اصلی ندارد."
