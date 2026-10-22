#!/usr/bin/env bash
#
# make-rtl-app-from-installed.sh — ساخت Zed-RTL از روی نسخه نصب‌شده
#
# Zed برنامه نیتیو (Rust) است و مثل اپ‌های Electron فایل CSS/JS برای تزریق
# ندارد؛ پس «پچ نسخه نصب‌شده» یعنی: کپی باندل + هویت جدا + امضای ad-hoc.
# فونت Vazirmatn از طریق settings.json مشترک اعمال می‌شود
# (scripts/apply-settings.sh).
#
# Usage:
#   ./scripts/make-rtl-app-from-installed.sh [--source PATH] [--dest PATH]
#
#   --source  باندل Zed نصب‌شده (پیش‌فرض: /Applications/Zed.app)
#   --dest    خروجی (پیش‌فرض: /Applications/Zed-RTL.app)
#
# بعد از هر آپدیت Zed از طریق خود برنامه، همین اسکریپت را دوباره اجرا کن
# تا Zed-RTL از نسخه جدید ساخته شود.

set -euo pipefail

SRC="/Applications/Zed.app"
DEST="/Applications/Zed-RTL.app"
APP_NAME="Zed-RTL"
BUNDLE_ID="dev.zed.Zed-RTL"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SRC="$2"; shift 2 ;;
        --dest) DEST="$2"; shift 2 ;;
        -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

if [[ ! -d "${SRC}" ]]; then
    echo "ERROR: source app not found: ${SRC}" >&2
    exit 1
fi

SRC_VER="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${SRC}/Contents/Info.plist" 2>/dev/null || echo unknown)"
echo "==> Source: ${SRC} (version ${SRC_VER})"

STAGE="$(mktemp -d)/${APP_NAME}.app"
echo "==> Staging copy at ${STAGE}"
rm -rf "${STAGE}"
cp -R "${SRC}" "${STAGE}"
chmod -R u+w "${STAGE}"

echo "==> Rebranding to ${APP_NAME}"
/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "${STAGE}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" "${STAGE}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${STAGE}/Contents/Info.plist"
if /usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "${STAGE}/Contents/Info.plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 zed-rtl" "${STAGE}/Contents/Info.plist"
fi
# پروویژنینگ متعلق به تیم Zed Industries است؛ با امضای ad-hoc ناسازگار است.
if [[ -f "${STAGE}/Contents/embedded.provisionprofile" ]]; then
    rm "${STAGE}/Contents/embedded.provisionprofile"
    echo "    (removed upstream embedded.provisionprofile)"
fi

# آیکون متمایز (بج سبز RTL) تا با Zed اصلی اشتباه نشود
if [[ -f "${REPO_ROOT}/assets/Zed-RTL.icns" ]]; then
    cp "${REPO_ROOT}/assets/Zed-RTL.icns" "${STAGE}/Contents/Resources/Zed.icns"
    echo "    (branded dock icon applied)"
fi

echo "==> Ad-hoc code signing…"
codesign --force --deep --sign - "${STAGE}"
codesign --verify --deep "${STAGE}" && echo "    signature OK"

if [[ -d "${DEST}" ]]; then
    BACKUP="${DEST}.backup-$(date +%Y%m%d-%H%M%S)"
    echo "==> Backing up existing install to ${BACKUP}"
    mv "${DEST}" "${BACKUP}" || sudo mv "${DEST}" "${BACKUP}"
fi
echo "==> Installing to ${DEST}"
cp -R "${STAGE}" "${DEST}" || sudo cp -R "${STAGE}" "${DEST}"
rm -rf "${STAGE}"

echo "==> Verifying install"
diff -q "${SRC}/Contents/MacOS/zed" "${DEST}/Contents/MacOS/zed" && echo "    binary identical to stock Zed ${SRC_VER}"
/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${DEST}/Contents/Info.plist"
codesign -dv "${DEST}" 2>&1 | grep -E "Identifier|Signature" | head -3

echo "==> DONE: ${DEST} (from installed Zed ${SRC_VER})"
echo "    First launch: right-click > Open (ad-hoc signature)."
echo "    NOTE: this gives a separate app + Vazirmatn font. Automatic RTL"
echo "    paragraph alignment needs a source build (see README section 5)."
