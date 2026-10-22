#!/usr/bin/env bash
#
# apply-settings.sh — فعال‌سازی فوری فونت Vazirmatn در Zed (بدون نیاز به بیلد)
#
# - از settings/zed-rtl.settings.json به ~/.config/zed/settings.json مرج می‌کند
# - قبل از تغییر، بکاپ تاریخ‌دار می‌گیرد
# - بررسی می‌کند فونت Vazirmatn در سیستم نصب باشد
#
# Usage: ./scripts/apply-settings.sh [--settings PATH] [--zed-settings PATH]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SNIPPET="${REPO_ROOT}/settings/zed-rtl.settings.json"
ZED_SETTINGS="${HOME}/.config/zed/settings.json"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --settings) SNIPPET="$2"; shift 2 ;;
        --zed-settings) ZED_SETTINGS="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--settings PATH] [--zed-settings PATH]"
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

# ۱) بررسی نصب بودن فونت Vazirmatn
# NOTE: عمداً خروجی fc-list در متغیر ذخیره می‌شود؛ استفاده مستقیم از
# `fc-list | grep -q` با `pipefail` خطای 141 (SIGPIPE) می‌دهد چون grep
# با اولین تطابق لوله را می‌بندد.
FONT_LIST="$(fc-list 2>/dev/null || true)"
if grep -qi "vazirmatn" <<< "${FONT_LIST}"; then
    echo "Vazirmatn font detected."
elif compgen -G "${HOME}/Library/Fonts/*azirmatn*" > /dev/null \
    || compgen -G "${HOME}/Library/Fonts/*azirMatn*" > /dev/null \
    || compgen -G "/Library/Fonts/*azirmatn*" > /dev/null; then
    echo "Vazirmatn font files found."
else
    echo "ERROR: Vazirmatn font is not installed." >&2
    echo "Install it first, e.g.: brew install --cask font-vazirmatn" >&2
    echo "or download from https://github.com/rastikerdar/vazirmatn" >&2
    exit 1
fi

# ۲) بکاپ
if [[ -f "${ZED_SETTINGS}" ]]; then
    BACKUP="${ZED_SETTINGS}.backup-$(date +%Y%m%d-%H%M%S)"
    cp "${ZED_SETTINGS}" "${BACKUP}"
    echo "Backup: ${BACKUP}"
else
    mkdir -p "$(dirname "${ZED_SETTINGS}")"
    echo '{}' > "${ZED_SETTINGS}"
    echo "Created new ${ZED_SETTINGS}"
fi

# ۳) مرج با python3 (بدون وابستگی خارجی)
python3 - "${SNIPPET}" "${ZED_SETTINGS}" <<'EOF'
import json, sys

def strip_jsonc(text):
    """Remove // comments outside string literals (Zed settings are JSONC)."""
    out, in_str, escaped, i = [], False, False, 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_str:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
        else:
            if ch == '"':
                in_str = True
                out.append(ch)
                i += 1
            elif ch == "/" and nxt == "/":
                while i < len(text) and text[i] != "\n":
                    i += 1
            else:
                out.append(ch)
                i += 1
    return "".join(out)


def strip_trailing_commas(text):
    """Remove trailing commas before } or ] outside strings (Zed tolerates them)."""
    out, in_str, escaped, i = [], False, False, 0
    while i < len(text):
        ch = text[i]
        if in_str:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
        else:
            if ch == '"':
                in_str = True
                out.append(ch)
                i += 1
            elif ch == ",":
                j = i + 1
                while j < len(text) and text[j] in " \t\r\n":
                    j += 1
                if j < len(text) and text[j] in "}]":
                    i += 1  # drop the trailing comma
                else:
                    out.append(ch)
                    i += 1
            else:
                out.append(ch)
                i += 1
    return "".join(out)

snippet_path, settings_path = sys.argv[1], sys.argv[2]
with open(snippet_path, encoding="utf-8") as f:
    snippet = json.loads(strip_trailing_commas(strip_jsonc(f.read())))
with open(settings_path, encoding="utf-8") as f:
    try:
        settings = json.loads(strip_trailing_commas(strip_jsonc(f.read())))
    except json.JSONDecodeError as e:
        print(f"ERROR: existing settings.json is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

def deep_merge(base, override):
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base

deep_merge(settings, snippet)
with open(settings_path, "w", encoding="utf-8") as f:
    json.dump(settings, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"Merged {len(snippet)} top-level keys into {settings_path}")
EOF

echo "Done. Restart Zed (or Zed-RTL) to pick up the new fonts."
