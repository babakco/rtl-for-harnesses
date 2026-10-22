#!/bin/bash
#
# patch-dsh-rtl.sh - build "DeepSeek Harness-RTL.app" from the installed
# "DeepSeek Harness.app" with Persian (RTL) text direction and the Vazirmatn
# font.
#
# Re-run this after every update of the original app. It always rebuilds from
# the pristine original, so it is idempotent and safe to run repeatedly.
#
#   ./patch-dsh-rtl.sh                # patch and install to /Applications
#   ./patch-dsh-rtl.sh --no-install   # build into ./build only
#   ./patch-dsh-rtl.sh --verify       # only re-run the engine test suite
#
set -euo pipefail

SRC_NAME="DeepSeek Harness"
DST_NAME="DeepSeek Harness-RTL"
SRC_APP="/Applications/${SRC_NAME}.app"
DST_APP="/Applications/${DST_NAME}.app"
BUNDLE_ID="com.deepseek.dsh.rtl"
URL_SCHEME="dsh-rtl"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build"
STAGE="$BUILD/stage"
PAYLOAD="$HERE/payload"
TOOLS="$HERE/tools"

DO_INSTALL=1
DO_VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-install) DO_INSTALL=0 ;;
    --verify)     DO_VERIFY_ONLY=1 ;;
    -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# ── 0. sanity ────────────────────────────────────────────────────────────
command -v node >/dev/null || die "node is required"
command -v codesign >/dev/null || die "codesign is required (macOS)"
[ -d "$SRC_APP" ] || die "source app not found: $SRC_APP"
[ -f "$PAYLOAD/fonts/vazirmatn-var.woff2" ] || die "missing payload font; run tools/make-font.py"

if [ "$DO_VERIFY_ONLY" -eq 1 ]; then
  say "running RTL engine test suite"
  (cd "$HERE" && node tools/test-rtl-engine.cjs)
  exit $?
fi

SRC_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$SRC_APP/Contents/Info.plist" 2>/dev/null || echo unknown)"
say "source app        : $SRC_APP"
say "source version    : $SRC_VERSION"

# ── 1. clean stage ───────────────────────────────────────────────────────
rm -rf "$STAGE"
mkdir -p "$STAGE"

# ── 2. copy the bundle ───────────────────────────────────────────────────
say "copying bundle (~250 MB, one time per run)"
ditto "$SRC_APP" "$STAGE/$DST_NAME.app"

# ── 3. regenerate the font from the installed one, if present ────────────
# A newer Vazirmatn on the system should flow into the patch automatically.
VazirSrc=""
for candidate in "$HOME/Library/Fonts/Vazirmatn[wght].ttf" "/Library/Fonts/Vazirmatn[wght].ttf"; do
  [ -f "$candidate" ] && { VazirSrc="$candidate"; break; }
done
if [ -n "$VazirSrc" ]; then
  say "rebuilding Vazirmatn woff2 from $(basename "$VazirSrc")"
  python3 "$TOOLS/make-font.py" "$VazirSrc" "$PAYLOAD/fonts/vazirmatn-var.woff2" >/dev/null
else
  warn "Vazirmatn TTF not found; using the font bundled in this project"
fi

# ── 4. patch app.asar in place ───────────────────────────────────────────
RESOURCES="$STAGE/$DST_NAME.app/Contents/Resources"
say "patching app.asar (RTL engine + Vazirmatn)"
PATCHMETA="$(node "$TOOLS/patch-app.cjs" "$RESOURCES/app.asar" "$BUILD/app.asar.patched" "$PAYLOAD")"
HEADER_HASH="$(printf '%s' "$PATCHMETA" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).headerHash))')"
[ -n "$HEADER_HASH" ] || die "could not read the recomputed asar header hash"
mv "$BUILD/app.asar.patched" "$RESOURCES/app.asar"
say "asar header sha256: $HEADER_HASH"

# ── 5. Info.plist ────────────────────────────────────────────────────────
PLIST="$STAGE/$DST_NAME.app/Contents/Info.plist"
say "rewriting Info.plist (bundle id $BUNDLE_ID)"

set_plist() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" 2>/dev/null || true; }

set_plist "Set :CFBundleIdentifier $BUNDLE_ID"
set_plist "Set :CFBundleName $DST_NAME"
set_plist "Set :CFBundleDisplayName $DST_NAME"
# Keep the deep-link scheme off the original app's `dsh` namespace.
set_plist "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 $URL_SCHEME"
set_plist "Set :CFBundleURLTypes:0:CFBundleURLName $DST_NAME"
# Electron verifies the asar header against this hash; it must match the new one.
set_plist "Set :ElectronAsarIntegrity:Resources/app.asar:algorithm SHA256"
set_plist "Set :ElectronAsarIntegrity:Resources/app.asar:hash $HEADER_HASH"

# ── 6. disable the self-updater in the copy ──────────────────────────────
# electron-updater is enabled only when Resources/app-update.yml exists
# (see the `enabled` closure of DesktopUpdates in lib/main.js). The patched
# copy must never replace itself, or the RTL payload would be overwritten.
if [ -f "$RESOURCES/app-update.yml" ]; then
  rm -f "$RESOURCES/app-update.yml"
  say "auto-update disabled for the RTL copy"
fi

# ── 7. rename the Electron helper bundles ─────────────────────────────────
# Electron locates its helpers as "<outer bundle name> Helper*.app" inside
# Contents/Frameworks. Renaming only the outer bundle therefore breaks the
# lookup and the process dies with "Unable to find helper app". The helper
# executables and their CFBundleExecutable have to move with the directory.
say "renaming Electron helper bundles to match the new bundle name"
FW="$STAGE/$DST_NAME.app/Contents/Frameworks"
OLD_BASE="${SRC_NAME} Helper"
NEW_BASE="${DST_NAME} Helper"

renamed_helpers=0
for helper in "$FW/$OLD_BASE.app" "$FW/$OLD_BASE (GPU).app" "$FW/$OLD_BASE (Plugin).app" "$FW/$OLD_BASE (Renderer).app"; do
  [ -d "$helper" ] || continue
  # "(GPU)" etc. are carried over verbatim to the new bundle name.
  suffix="$(basename "$helper" .app)"
  suffix="${suffix#"$OLD_BASE"}"
  target="$FW/${NEW_BASE}${suffix}.app"
  # Move the bundle first, then the executable inside it: doing it the other
  # way round would create an empty target tree and orphan the Info.plist.
  mv "$helper" "$target"
  old_exe="$target/Contents/MacOS/${OLD_BASE}${suffix}"
  new_exe="$target/Contents/MacOS/${NEW_BASE}${suffix}"
  [ -f "$old_exe" ] || die "helper executable not found: $old_exe"
  mv "$old_exe" "$new_exe"
  hp="$target/Contents/Info.plist"
  [ -f "$hp" ] || die "helper Info.plist missing: $hp"
  /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${NEW_BASE}${suffix}" "$hp" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${NEW_BASE}${suffix}" "$hp" 2>/dev/null || true
  # Keep the helper bundle ids distinct from the original app's helpers.
  case "${suffix}" in
    "")       /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID.helper" "$hp" 2>/dev/null || true ;;
    " (GPU)") /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID.helper.GPU" "$hp" 2>/dev/null || true ;;
    *)        /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID.helper.${suffix//[^A-Za-z0-9]/}" "$hp" 2>/dev/null || true ;;
  esac
  renamed_helpers=$((renamed_helpers + 1))
done
[ "$renamed_helpers" -gt 0 ] || warn "no Electron helper bundles found - is this still an Electron app?"
say "renamed $renamed_helpers helper bundle(s)"

# ── 8. re-sign ───────────────────────────────────────────────────────────
say "re-signing ad-hoc (with the original JIT entitlements)"
rm -rf "$STAGE/$DST_NAME.app/Contents/_CodeSignature"

# Preserve the entitlements DeepSeek signed with; Electron needs the JIT and
# library-validation exceptions to start at all.
ENTITLEMENTS="$BUILD/entitlements.plist"
if ! codesign -d --entitlements - --xml "$SRC_APP" >"$ENTITLEMENTS" 2>/dev/null; then
  cat >"$ENTITLEMENTS" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
PLIST
  warn "could not read the original entitlements; using Electron defaults"
fi

codesign --force --deep --sign - \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  "$STAGE/$DST_NAME.app" 2>&1 | sed 's/^/    /'

codesign --verify --deep --strict "$STAGE/$DST_NAME.app" 2>&1 | sed 's/^/    /' || warn "codesign --verify reported problems"

xattr -cr "$STAGE/$DST_NAME.app"

# ── 9. install ───────────────────────────────────────────────────────────
if [ "$DO_INSTALL" -eq 1 ]; then
  say "installing to $DST_APP"
  if [ -e "$DST_APP" ]; then
    # Quit any running copy first, otherwise the swap leaves a stale process.
    pkill -f "$DST_NAME.app/Contents/MacOS" 2>/dev/null || true
    rm -rf "$DST_APP"
  fi
  ditto "$STAGE/$DST_NAME.app" "$DST_APP"
  rm -rf "$STAGE"
  say "done: $DST_APP"
  cat <<EOF

    Launch it with:   open -a "$DST_NAME"
    The original app is untouched and still installed as "$SRC_NAME".

    Note: the RTL copy is intentionally a separate bundle id
    ($BUNDLE_ID) with auto-update turned off, so the two apps can sit
    side by side and the patch is never silently overwritten. Update the
    original, then re-run this script.
EOF
else
  say "built at $STAGE/$DST_NAME.app (not installed)"
fi
