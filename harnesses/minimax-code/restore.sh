#!/usr/bin/env bash
#
# restore.sh — حذف نسخهٔ RTL (نسخهٔ اصلی دست‌نخورده باقی می‌ماند)
#
set -euo pipefail

OUT_APP="${1:-/Applications/MiniMax Code-RTL.app}"

if [[ ! -d "$OUT_APP" ]]; then
  echo "نسخهٔ RTL برای حذف پیدا نشد: $OUT_APP"
  exit 0
fi

echo "حذف: $OUT_APP"
rm -rf "$OUT_APP"
echo "✅ حذف شد. نسخهٔ اصلی دست‌نخورده باقی است."
