#!/usr/bin/env bash
#
# apply-patch.sh — ساخت/بازسازی «Kimi RTL.app» از روی نسخهٔ نصب‌شدهٔ Kimi.app
#
#   ./apply-patch.sh                       # از /Applications/Kimi.app
#   ./apply-patch.sh /path/to/Kimi.app     # از یک منبع دیگر
#   ./apply-patch.sh /Applications/Kimi.app "/Applications/Kimi RTL.app"
#
# این اسکریپت idempotent است: هر بار اجرا، خروجی قبلی را پاک و از روی
# نسخهٔ اصلی بازسازی می‌کند؛ پس بعد از هر آپدیت Kimi کافی است دوباره اجرا شود.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_APP="${1:-/Applications/Kimi.app}"
OUT_APP="${2:-/Applications/Kimi RTL.app}"

bold() { printf "\n\033[1m%s\033[0m\n" "$*"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "خطا: این پچ فقط روی macOS کار می‌کند." >&2
  exit 1
fi

if [[ ! -d "$SRC_APP" ]]; then
  echo "خطا: اپ منبع پیدا نشد: $SRC_APP" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "خطا: Node.js لازم است (node را نصب/در PATH قرار دهید)." >&2
  exit 1
fi

bold "۱/۳  ساخت آرتیفکت‌های رندرر (CSS + preload)"
node "$ROOT/patches/scripts/build-preload.cjs.js"

bold "۲/۳  کلون و پچ‌کردن باندل"
node "$ROOT/patches/scripts/patch-asar.mjs" --src "$SRC_APP" --out "$OUT_APP"

bold "۳/۳  بازبینی یکپارچگی"
node "$ROOT/patches/scripts/verify-asar.mjs" "$OUT_APP"

bold "تمام ✅"
echo "اجرا:        open \"$OUT_APP\""
echo "اشکال‌زدایی: KIMI_RTL_DEBUG=1 \"$OUT_APP/Contents/MacOS/Kimi\""
echo "خاموش‌کردن:  KIMI_RTL_DISABLE=1 \"$OUT_APP/Contents/MacOS/Kimi\""
