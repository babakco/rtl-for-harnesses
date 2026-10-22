#!/bin/bash
# ============================================================================
# Xiaomi MiMo AI — RTL (Persian) patcher for macOS
#
# Builds a patched *copy* of the installed app next to it:
#
#   /Applications/Xiaomi MiMo AI.app        <- original, never modified
#   /Applications/Xiaomi MiMo AI-RTL.app    <- patched daily driver
#
# What the patch does (see rtl-fa.js / rtl-fa.css):
#   * Any sentence / paragraph that contains at least one Persian letter is
#     rendered RTL — even when it starts with Latin characters or punctuation.
#   * Those same blocks switch to the Vazirmatn font (embedded in the archive).
#   * Code, the terminal and math stay LTR + monospace.
#
# How it is applied:
#   1. `ditto` the original app to the RTL path (always a fresh copy, so the
#      patch is idempotent and never accumulates).
#   2. Surgically patch app.asar: add out/renderer/rtl-fa.{css,js} + the
#      Vazirmatn woff2 files and inject <link>/<script> into index.html.
#   3. Refresh ElectronAsarIntegrity in Info.plist (otherwise Electron refuses
#      to load the changed archive).
#   4. Give the copy its own display name, disable its auto-updater (so an
#      official update can never silently wipe the patch), ad-hoc re-sign.
#
# Re-run this script after the original app updates.
#
# Payload version: bumped manually for every behaviour change so the installed
# app can be audited:
#   * rtl-fa.js      -> var VERSION = "X.Y.Z" (+ header comment)
#   * rtl-fa.css     -> header comment vX.Y.Z
#   * package.json   -> "version": "X.Y.Z"
#   * README.md/CLAUDE.md/GUIDE.md changelog tables
# The installed payload version is printed as `[mimo-rtl] active vX.Y.Z` in
# DevTools and stored in `window.__mimoRTL.version`.
#
# Current payload: v1.1.0
#   * v1.0.0 — initial release: RTL + Vazirmatn for Persian blocks, code /
#              math / terminal stay LTR. Scheduling was rAF-based and silently
#              died when the window was hidden (visibilityState=hidden), so
#              Persian blocks were never flipped.
#   * v1.1.0 — replaced rAF with a plain 60ms timer sweep so updates work even
#              in a hidden/minimised window or during streaming renders (see
#              NOTE in rtl-fa.js schedule()). Also added
#              .hljs/.shiki/.prismjs/.code-block/.codeblock to SKIP_SELECTOR.
#
# Usage:
#   ./patch-xiaomi-mimo-rtl.sh                 # build/refresh the RTL app
#   ./patch-xiaomi-mimo-rtl.sh --status        # show what is installed
#   ./patch-xiaomi-mimo-rtl.sh --src APP --dst APP
#   ./patch-xiaomi-mimo-rtl.sh --no-sign       # skip the ad-hoc re-sign step
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_ASAR="$SCRIPT_DIR/patch_asar.py"
PAYLOAD_JS="$SCRIPT_DIR/rtl-fa.js"
PAYLOAD_CSS="$SCRIPT_DIR/rtl-fa.css"
FONTS_DIR="$SCRIPT_DIR/fonts"

SRC="/Applications/Xiaomi MiMo AI.app"
DST="/Applications/Xiaomi MiMo AI-RTL.app"
DO_SIGN=1
KEEP_TEMP=0
PAYLOAD_VERSION="$(grep -m1 -o 'var VERSION = "[^"]*"' "$SCRIPT_DIR/rtl-fa.js" | cut -d'"' -f2)"

# The bundle is renamed for humans only: CFBundleName / CFBundleIdentifier are
# deliberately kept identical so the RTL app keeps sharing the original
# profile (login, conversations, projects) and Electron can still locate
# "Xiaomi MiMo AI Helper*.app" inside Frameworks.
DISPLAY_NAME="Xiaomi MiMo AI-RTL"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }
log()  { echo -e "  ${CYAN}[*]${NC} $1"; }
ok()   { echo -e "  ${GREEN}[+]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
die()  { echo -e "  ${RED}[x]${NC} $1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --dst) DST="$2"; shift 2 ;;
    --no-sign) DO_SIGN=0; shift ;;
    --keep-temp) KEEP_TEMP=1; shift ;;
    --status) STATUS=1; shift ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "Unknown flag: $1" ;;
  esac
done

# ---------------------------------------------------------------- guards ----
command -v python3 >/dev/null || die "python3 is required (Xcode command line tools)"
command -v ditto   >/dev/null || die "ditto is required (part of macOS)"
[ -f "$PATCH_ASAR" ] || die "missing $PATCH_ASAR"
[ -f "$PAYLOAD_JS" ] || die "missing $PAYLOAD_JS"
[ -f "$PAYLOAD_CSS" ] || die "missing $PAYLOAD_CSS"
node --check "$PAYLOAD_JS" >/dev/null 2>&1 || die "syntax error in $PAYLOAD_JS"

FONT_FILES=("$FONTS_DIR/vazirmatn-regular.woff2" "$FONTS_DIR/vazirmatn-medium.woff2" "$FONTS_DIR/vazirmatn-bold.woff2")
for f in "${FONT_FILES[@]}"; do
  [ -f "$f" ] || die "missing font $f"
done

# ---------------------------------------------------------------- status ----
status_line() {
  local app="$1" label="$2"
  if [ ! -d "$app" ]; then
    printf "  %-28s %s\n" "$label" "not installed"
    return
  fi
  local version bundle sig
  version="$(plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist" 2>/dev/null || echo '?')"
  bundle="$(plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist" 2>/dev/null || echo '?')"
  if codesign -v "$app" >/dev/null 2>&1; then sig="signature: ok"; else sig="signature: INVALID"; fi
  printf "  %-28s v%s  %s  (%s)\n" "$label" "$version" "$bundle" "$sig"
}

if [ -n "${STATUS:-}" ]; then
  step "Xiaomi MiMo AI RTL patch status"
  status_line "$SRC" "original"
  status_line "$DST" "RTL build"
  if [ -d "$DST" ]; then
    asar="$DST/Contents/Resources/app.asar"
    if python3 "$PATCH_ASAR" "$asar" --extract "out/renderer/index.html=/tmp/rtl-index-check.html" >/dev/null 2>&1 \
       && grep -q 'rtl-fa.js' /tmp/rtl-index-check.html; then
      ok "renderer patch present in app.asar (payload $PAYLOAD_VERSION)"
    else
      warn "renderer patch NOT found in app.asar"
    fi
    rm -f /tmp/rtl-index-check.html
  fi
  exit 0
fi

[ -d "$SRC" ] || die "original app not found: $SRC"
[ "$SRC" != "$DST" ] || die "--src and --dst must differ"
[ -f "$SRC/Contents/Resources/app.asar" ] || die "app.asar not found in $SRC"

SRC_VERSION="$(plutil -extract CFBundleShortVersionString raw "$SRC/Contents/Info.plist" 2>/dev/null || echo '?')"
log "source app : $SRC (v$SRC_VERSION)"
log "target app : $DST"

# ------------------------------------------------------- close running app --
if pgrep -f "$DST/Contents/MacOS/" >/dev/null 2>&1; then
  step "Closing the running RTL app"
  osascript -e "tell application \"$(basename "$DST" .app)\" to quit" >/dev/null 2>&1 || true
  sleep 2
  pkill -f "$DST/Contents/MacOS/" >/dev/null 2>&1 || true
  sleep 1
  ok "closed"
fi
if pgrep -f "$SRC/Contents/MacOS/" >/dev/null 2>&1; then
  warn "the ORIGINAL app is currently running."
  warn "quit it before continuing if it may update itself during the copy."
fi

# ------------------------------------------------------------ fresh copy ----
step "Copying the original app"
rm -rf "$DST"
ditto "$SRC" "$DST"
xattr -cr "$DST" 2>/dev/null || true
ok "copied to $DST"

ASAR="$DST/Contents/Resources/app.asar"
[ -f "$ASAR" ] || die "app.asar missing after copy"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mimo-rtl.XXXXXX")"
cleanup() { [ "$KEEP_TEMP" -eq 1 ] || rm -rf "$TMP_DIR"; }
trap cleanup EXIT
log "work dir: $TMP_DIR"

# ------------------------------------------------- 1) index.html injection --
step "Injecting the renderer payload into app.asar"

python3 "$PATCH_ASAR" "$ASAR" --extract "out/renderer/index.html=$TMP_DIR/index.html" >/dev/null

python3 - "$TMP_DIR/index.html" "$TMP_DIR/index.patched.html" <<'PY'
import sys

src, dst = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as fh:
    html = fh.read()

if "rtl-fa.js" in html:
    print("index.html already carries the RTL payload; leaving it untouched")
else:
    marker = "</head>"
    if marker not in html:
        raise SystemExit("index.html has no </head> anchor")
    inject = (
        '    <!-- mimo-rtl: Persian/Arabic blocks -> RTL + Vazirmatn -->\n'
        '    <link rel="stylesheet" href="./rtl-fa.css" />\n'
        '    <script src="./rtl-fa.js" defer></script>\n'
    )
    html = html.replace(marker, inject + "  " + marker, 1)
    print("index.html patched")

with open(dst, "w", encoding="utf-8") as fh:
    fh.write(html)
PY

# ------------------------------------------------ 2) rewrite the archive ----
python3 "$PATCH_ASAR" "$ASAR" "$TMP_DIR/app.asar" \
  --replace "out/renderer/index.html=$TMP_DIR/index.patched.html" \
  --add     "out/renderer/rtl-fa.css=$PAYLOAD_CSS" \
  --add     "out/renderer/rtl-fa.js=$PAYLOAD_JS" \
  --add     "out/renderer/assets/vazirmatn-regular.woff2=${FONT_FILES[0]}" \
  --add     "out/renderer/assets/vazirmatn-medium.woff2=${FONT_FILES[1]}" \
  --add     "out/renderer/assets/vazirmatn-bold.woff2=${FONT_FILES[2]}"

mv "$TMP_DIR/app.asar" "$ASAR"
ok "app.asar rebuilt"

# ------------------------------------------------------ 3) Info.plist work --
step "Updating Info.plist"

NEW_HASH="$(python3 "$PATCH_ASAR" --hash "$ASAR")"
log "new asar header hash: $NEW_HASH"

python3 - "$DST/Contents/Info.plist" "$NEW_HASH" "$DISPLAY_NAME" <<'PY'
import plistlib
import sys

plist_path, new_hash, display_name = sys.argv[1], sys.argv[2], sys.argv[3]

with open(plist_path, "rb") as fh:
    info = plistlib.load(fh)

# Electron refuses to load a modified archive when the recorded integrity hash
# no longer matches ("Failed to get integrity for validatable asar").
integrity = info.setdefault("ElectronAsarIntegrity", {})
integrity["Resources/app.asar"] = {"algorithm": "SHA256", "hash": new_hash}

# Human-facing name only. CFBundleName, CFBundleIdentifier and
# CFBundleExecutable MUST stay as-is: Electron locates
# "<CFBundleName> Helper*.app" inside Contents/Frameworks, and the shared
# bundle id is what keeps the existing profile (login, chats) available.
info["CFBundleDisplayName"] = display_name

# Turn this copy's updater off. Without it an official auto-update would
# silently replace the patched archive and lose the RTL patch.
env = dict(info.get("LSEnvironment") or {})
env.setdefault("MallocNanoZone", "0")
env["MIMO_MAC_AUTOUPDATE"] = "0"
env["MIMO_UPDATE_URL"] = "http://127.0.0.1:9/manifest.json"
info["LSEnvironment"] = env

with open(plist_path, "wb") as fh:
    plistlib.dump(info, fh)

print(f"CFBundleDisplayName : {info['CFBundleDisplayName']}")
print(f"CFBundleIdentifier  : {info['CFBundleIdentifier']} (unchanged, shared profile)")
print(f"LSEnvironment       : {info['LSEnvironment']}")
PY

# belt and braces: electron-updater reads this file when present
rm -f "$DST/Contents/Resources/app-update.yml"
ok "Info.plist updated, auto-update disabled for this copy"

# -------------------------------------------------------- 4) ad-hoc sign ----
if [ "$DO_SIGN" -eq 1 ]; then
  step "Ad-hoc re-signing (the archive changed, the original seal is void)"

  ENT="$TMP_DIR/entitlements.plist"
  cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.device.audio-input</key><true/>
</dict>
</plist>
PLIST

  # The original entitlements are kept (they carry no team id, so an ad-hoc
  # signature may legally hold them) together with the hardened runtime.
  if codesign --force --deep --sign - --options runtime \
        --entitlements "$ENT" "$DST" >"$TMP_DIR/codesign.log" 2>&1 \
     && codesign --verify --deep --strict "$DST" >/dev/null 2>&1; then
    ok "signed ad-hoc with the original entitlements + hardened runtime"
  else
    warn "faithful re-sign failed, retrying with a plain ad-hoc signature"
    sed -n '1,5p' "$TMP_DIR/codesign.log" | sed 's/^/      /'
    codesign --force --deep --sign - "$DST" >>"$TMP_DIR/codesign.log" 2>&1 || true
  fi
  xattr -cr "$DST" 2>/dev/null || true
fi

# refresh LaunchServices so the new LSEnvironment + display name are picked up
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
[ -x "$LSREGISTER" ] && "$LSREGISTER" -f "$DST" >/dev/null 2>&1 || true

# ---------------------------------------------------------- 5) verify -------
step "Verifying"

FAILED=0

if codesign -v "$DST" >/dev/null 2>&1; then
  ok "code signature: $(codesign -d --verbose=2 "$DST" 2>&1 | grep -m1 '^Authority=' || echo 'ad-hoc')"
else
  warn "codesign --verify reports a problem (expected for ad-hoc; right-click > Open on first launch)"
fi

PLIST="$DST/Contents/Info.plist"
DISPLAY="$(plutil -extract CFBundleDisplayName raw "$PLIST" 2>/dev/null || echo '?')"
NAME="$(plutil -extract CFBundleName raw "$PLIST" 2>/dev/null || echo '?')"
VERSION="$(plutil -extract CFBundleShortVersionString raw "$PLIST" 2>/dev/null || echo '?')"
BUNDLE="$(plutil -extract CFBundleIdentifier raw "$PLIST" 2>/dev/null || echo '?')"
PAYLOAD_VER="$(grep -m1 -o 'var VERSION = "[^"]*"' "$PAYLOAD_JS" | cut -d'"' -f2)"
PLIST_HASH="$(python3 - "$PLIST" <<'PY'
import plistlib, sys
data = plistlib.load(open(sys.argv[1], "rb"))
print(data["ElectronAsarIntegrity"]["Resources/app.asar"]["hash"])
PY
)"
FILE_HASH="$(python3 "$PATCH_ASAR" --hash "$ASAR")"

[ "$DISPLAY" = "$DISPLAY_NAME" ] && ok "CFBundleDisplayName = $DISPLAY" \
  || { warn "unexpected CFBundleDisplayName: $DISPLAY"; FAILED=1; }
[ "$NAME" = "Xiaomi MiMo AI" ] && ok "CFBundleName untouched ($NAME, helpers still resolve)" \
  || { warn "CFBundleName changed to '$NAME' — Electron helper lookup may break"; FAILED=1; }
[ "$BUNDLE" = "com.xiaomi.mimo.desktop-ai" ] && ok "CFBundleIdentifier = $BUNDLE (shared profile)" \
  || warn "CFBundleIdentifier is $BUNDLE (profile will not be shared)"
if [ "$PLIST_HASH" = "$FILE_HASH" ]; then
  ok "ElectronAsarIntegrity matches the archive"
else
  warn "ElectronAsarIntegrity mismatch: plist=$PLIST_HASH file=$FILE_HASH"
  FAILED=1
fi
[ -f "$DST/Contents/Resources/app-update.yml" ] \
  && warn "app-update.yml still present" \
  || ok "app-update.yml removed (no self-update in the RTL copy)"

for entry in out/renderer/rtl-fa.js out/renderer/rtl-fa.css \
             out/renderer/assets/vazirmatn-regular.woff2 \
             out/renderer/assets/vazirmatn-bold.woff2; do
  if python3 "$PATCH_ASAR" "$ASAR" --extract "$entry=$TMP_DIR/check.bin" >/dev/null 2>&1; then
    ok "archive contains $entry ($(wc -c < "$TMP_DIR/check.bin" | tr -d ' ') bytes)"
  else
    warn "archive is MISSING $entry"
    FAILED=1
  fi
done

python3 "$PATCH_ASAR" "$ASAR" --extract "out/renderer/index.html=$TMP_DIR/check.html" >/dev/null 2>&1
if grep -q 'rtl-fa.js' "$TMP_DIR/check.html" && grep -q 'rtl-fa.css' "$TMP_DIR/check.html"; then
  ok "index.html loads rtl-fa.css + rtl-fa.js"
else
  warn "index.html does not reference the RTL payload"
  FAILED=1
fi

if [ -d "$DST/Contents/Resources/app.asar.unpacked" ]; then
  ok "app.asar.unpacked preserved ($(find "$DST/Contents/Resources/app.asar.unpacked" -type f | wc -l | tr -d ' ') files)"
fi

step "Done"
[ "$FAILED" -eq 0 ] && ok "everything verified" || warn "some checks failed — see above"

cat <<EOF

  $(basename "$DST")
    source      : $SRC (v$SRC_VERSION)
    version     : $VERSION
    location    : $DST
    entry       : rtl-fa.js v$PAYLOAD_VER

  Test it ($(basename "$DST") must be launched, right-click > Open the first time):
    1. In the chat composer type:  Hello this is English ولی این جمله فارسی است
       -> the composer flips to RTL + Vazirmatn as soon as Persian appears.
    2. Send it. The user bubble and the model's answer must be RTL for any
       paragraph containing Persian, even one that starts with Latin text.
    3. A purely English paragraph must stay LTR, and a code block must stay
       LTR + monospace (and must not be mirrored).
    4. DevTools console (View > Toggle Developer Tools) shows:
         [mimo-rtl] active v...
       Manual re-scan:  window.__mimoRTL.rescan()

  Notes
    * $(basename "$SRC") is left completely untouched; its own auto-update and
      signature keep working.
    * Both apps share bundle id $BUNDLE and therefore the same profile
      (login, chats, projects). Run only one at a time.
    * This copy has its updater disabled so an official update cannot wipe the
      patch. After the original app updates, re-run:
          bash "$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
EOF

[ "$FAILED" -eq 0 ] || exit 1
