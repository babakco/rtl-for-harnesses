#!/usr/bin/env bash
#
# restore.sh — حذف کامل نسخهٔ پچ‌شده و بازگشت به حالت اولیه
#
# نسخهٔ اصلی Kimi.app هرگز دست‌کاری نمی‌شود؛ این اسکریپت فقط اپ ساخته‌شده
# توسط پچ را می‌بندد و پاک می‌کند.
#
#   ./restore.sh                          # حذف /Applications/Kimi RTL.app
#   ./restore.sh "/Applications/Kimi RTL.app"
#
set -euo pipefail

OUT_APP="${1:-/Applications/Kimi RTL.app}"

if [[ ! -d "$OUT_APP" ]]; then
  echo "چیزی برای حذف نیست: $OUT_APP"
  exit 0
fi

echo "بستن اپ: $OUT_APP"
pkill -f "$OUT_APP" 2>/dev/null || true
sleep 1

echo "حذف: $OUT_APP"
rm -rf "$OUT_APP"

echo "انجام شد ✅  (نسخهٔ اصلی Kimi.app دست‌نخورده است)"
