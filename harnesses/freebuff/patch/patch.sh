#!/usr/bin/env bash
# ============================================================================
# Freebuff Desktop — RTL + Vazirmatn patch (reusable across versions)
#
# DEFAULT WORKFLOW (clone): the original app is NEVER modified. The script
# copies it to a separate RTL edition and patches ONLY the copy:
#   /Applications/Freebuff.app      <- original, stays pristine (update this one)
#   /Applications/Freebuff-RTL.app  <- RTL edition (rebuilt from original)
#
# What it does (per block, via rtl.js):
#   - Any text block containing Persian/Arabic -> dir="rtl" (right-aligned,
#     readable right-to-left), even if the sentence starts with English words.
#   - Pure-English blocks and code/terminal stay LTR. Layout stays LTR.
#   - Persian/Arabic glyphs use the bundled Vazirmatn variable font
#     (English keeps using Inter).
#
# It survives app updates: each release re-hashes asset filenames
# (ui/assets/index-*.css), so we re-locate files every run instead of
# hard-coding filenames. The RTL copy gets its own bundle identifier
# (com.freebuff.desktop.rtl), display name (Freebuff-RTL) and updater cache
# dir, and is re-signed ad-hoc (preserving entitlements) so macOS does not
# flag it as "damaged". Backups (*.patchbak) are created from the pristine
# files inside the RTL copy.
#
# Usage (from this repo's root):
#   bash patch/patch.sh                        # build RTL copy (default)
#   bash patch/patch.sh --relaunch             # build RTL copy -> launch it -> verify
#   bash patch/patch.sh --clone                # explicit clone (same as default)
#   bash patch/patch.sh --src /path/Orig.app --dst /path/RTL.app
#   bash patch/patch.sh --in-place             # LEGACY: patch the app directly
#   bash patch/patch.sh --in-place --force --relaunch
#   bash patch/patch.sh --in-place /path/to/Freebuff.app
#
# Recommended after EVERY install/update of the ORIGINAL Freebuff:
#   bash patch/patch.sh --relaunch
#
# Idempotent: the RTL copy is rebuilt fresh from the original every run;
# --force only affects legacy --in-place mode.
# ============================================================================
set -euo pipefail

FORCE=0
RELAUNCH=0
MODE="clone"          # default: build a separate RTL copy, never touch the original
SRC_APP=""
DST_APP=""
POSITIONAL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clone)    MODE="clone"; shift ;;
    --in-place) MODE="in-place"; shift ;;
    --force)    FORCE=1; shift ;;
    --relaunch) RELAUNCH=1; shift ;;
    --src)      SRC_APP="$2"; shift 2 ;;
    --dst)      DST_APP="$2"; shift 2 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *)  POSITIONAL="$1"; shift ;;
  esac
done

DEFAULT_SRC="/Applications/Freebuff.app"
if [[ "$MODE" == "clone" ]]; then
  SRC_APP="${SRC_APP:-${POSITIONAL:-$DEFAULT_SRC}}"
  if [[ -z "$DST_APP" ]]; then
    if [[ "$SRC_APP" == "$DEFAULT_SRC" ]]; then
      DST_APP="/Applications/Freebuff-RTL.app"
    else
      DST_APP="$(dirname "$SRC_APP")/$(basename "$SRC_APP" .app)-RTL.app"
    fi
  fi
  TARGET_DIR="$DST_APP"
else
  # LEGACY in-place mode: patch the given app directly (modifies + re-signs it).
  TARGET_DIR="${POSITIONAL:-$DEFAULT_SRC}"
  SRC_APP="$TARGET_DIR"
  DST_APP="$TARGET_DIR"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_CSS="$SCRIPT_DIR/patch.css"
PATCH_JS="$SCRIPT_DIR/rtl.js"
FONT_SRC="$SCRIPT_DIR/assets/vazirmatn-wght.woff2"
JS_MARKER='src="./assets/rtl.js"'
CSS_MARKER="FBF-RTL-PATCH-V5"
# Any-version prefix: dirty/normalize detection must catch older patches too
# (V2 marker from pre-0.0.146 editions), while new appends use CSS_MARKER.
CSS_MARKER_ANY="FBF-RTL-PATCH-V"

# --- 1. Validate the SOURCE (original — never modified in clone mode) --------
if [[ ! -d "$SRC_APP" ]]; then
  echo "ERROR: source app not found at $SRC_APP" >&2
  echo "Pass it explicitly, e.g.: bash patch/patch.sh --src /path/to/Freebuff.app" >&2
  exit 1
fi
SRC_UI="$SRC_APP/Contents/Resources/orchestrator/ui"
if [[ ! -d "$SRC_UI" ]]; then
  echo "ERROR: ui dir not found at $SRC_UI" >&2
  exit 1
fi
APP_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$SRC_APP/Contents/Info.plist" 2>/dev/null || echo "?")
SRC_NAME="$(basename "$SRC_APP" .app)"
echo "Source (original, stays untouched): $SRC_APP (version $APP_VER)"

NORMALIZE_COPY=0
if [[ "$MODE" == "clone" ]]; then
  case "$DST_APP" in *.app) ;; *)
    echo "ERROR: destination must end with .app: $DST_APP" >&2; exit 1 ;;
  esac
  if [[ "$DST_APP" == "$SRC_APP" ]]; then
    echo "ERROR: destination equals source ($DST_APP); refusing." >&2; exit 1
  fi
  case "$DST_APP" in /|/Applications|/Applications/|/System|/System/*|/usr|/usr/*)
    echo "ERROR: refusing dangerous destination: $DST_APP" >&2; exit 1 ;;
  esac
  DST_NAME="$(basename "$DST_APP" .app)"
  echo "RTL copy will be built at: $DST_APP"

  # The RTL copy must be built from PRISTINE bytes. If the source itself
  # carries a previous patch, we can still proceed only when clean
  # .patchbak backups exist — the COPY is then normalized to pristine
  # (the source itself is never touched).
  SRC_DIRTY=0
  SRC_CSS=$(ls "$SRC_UI"/assets/index-*.css 2>/dev/null | head -1 || true)
  if [[ -n "$SRC_CSS" ]] && grep -qF "$CSS_MARKER_ANY" "$SRC_CSS" 2>/dev/null; then SRC_DIRTY=1; fi
  if grep -qF "$JS_MARKER" "$SRC_UI/index.html" 2>/dev/null; then SRC_DIRTY=1; fi
  if [[ -e "$SRC_UI/assets/rtl.js" || -e "$SRC_UI/assets/vazirmatn-wght.woff2" ]]; then SRC_DIRTY=1; fi
  if [[ "$SRC_DIRTY" -eq 1 ]]; then
    RECOVERABLE=1
    if [[ -n "$SRC_CSS" ]] && grep -qF "$CSS_MARKER_ANY" "$SRC_CSS" 2>/dev/null; then
      if [[ ! -f "$SRC_CSS.patchbak" ]] || grep -qF "$CSS_MARKER_ANY" "$SRC_CSS.patchbak" 2>/dev/null; then RECOVERABLE=0; fi
    fi
    if grep -qF "$JS_MARKER" "$SRC_UI/index.html" 2>/dev/null; then
      if [[ ! -f "$SRC_UI/index.html.patchbak" ]] || grep -qF "$JS_MARKER" "$SRC_UI/index.html.patchbak" 2>/dev/null; then RECOVERABLE=0; fi
    fi
    if [[ "$RECOVERABLE" -eq 1 ]]; then
      NORMALIZE_COPY=1
      echo "NOTE: source carries a previous patch; the COPY will be normalized"
      echo "      to pristine bytes via .patchbak (source itself is untouched)."
    else
      echo "ERROR: source app is already patched and has no clean .patchbak" >&2
      echo "       backups. Reinstall the pristine original, then re-run." >&2
      exit 1
    fi
  fi
else
  APP_NAME_FALLBACK="$(basename "$TARGET_DIR" .app)"
  DST_NAME="$APP_NAME_FALLBACK"
fi

# --- 2. Quit running instances if relaunching ---------------------------------
# (The RTL copy keeps the same executable name, so match by bundle path.)
is_running() { # $1 = bundle base name (e.g. Freebuff or Freebuff-RTL)
  pgrep -f "$1.app/Contents/MacOS/" >/dev/null 2>&1
}
quit_one() { # $1 = bundle base name
  local n="$1"
  osascript -e "quit app \"$n\"" >/dev/null 2>&1 || true
  sleep 2
  pkill -f "$n.app/Contents/MacOS/" >/dev/null 2>&1 || true
}
if [[ "$MODE" == "clone" ]]; then
  SRC_RUNNING=0; DST_RUNNING=0
  is_running "$SRC_NAME" && SRC_RUNNING=1 || true
  is_running "$DST_NAME" && DST_RUNNING=1 || true
  if [[ "$RELAUNCH" -eq 1 ]]; then
    [[ "$SRC_RUNNING" -eq 1 ]] && { echo "Quitting $SRC_NAME..."; quit_one "$SRC_NAME"; }
    [[ "$DST_RUNNING" -eq 1 ]] && { echo "Quitting $DST_NAME..."; quit_one "$DST_NAME"; }
    pkill -f "orchestrator.js" >/dev/null 2>&1 || true
    sleep 1
  else
    [[ "$DST_RUNNING" -eq 1 ]] && echo "NOTE: $DST_NAME is running; relaunch it (or use --relaunch) to see changes."
    [[ "$SRC_RUNNING" -eq 1 ]] && echo "NOTE: original $SRC_NAME is running; it is never modified either way."
  fi
else
  APP_NAME="$DST_NAME"
  if is_running "$APP_NAME"; then
    if [[ "$RELAUNCH" -eq 1 ]]; then
      echo "Quitting $APP_NAME..."
      quit_one "$APP_NAME"
      pkill -f "orchestrator.js" >/dev/null 2>&1 || true
      sleep 1
    else
      echo "NOTE: $APP_NAME is running. The patch is written anyway, but you MUST"
      echo "      quit and relaunch it (or use --relaunch) to see changes."
    fi
  fi
fi

# --- 2b. Clone mode: build a FRESH RTL copy from the original ---------------
if [[ "$MODE" == "clone" ]]; then
  if [[ -e "$DST_APP" ]]; then
    echo "Removing previous RTL copy: $DST_APP"
    rm -rf -- "$DST_APP"
  fi
  PARENT="$(dirname "$DST_APP")"
  [[ -d "$PARENT" ]] || mkdir -p "$PARENT"
  echo "Copying original -> RTL edition (this can take a bit)..."
  ditto "$SRC_APP" "$DST_APP"
  echo "Copy done: $DST_APP"

  UI_DST="$DST_APP/Contents/Resources/orchestrator/ui"
  if [[ "$NORMALIZE_COPY" -eq 1 ]]; then
    DST_CSS_N=$(ls "$UI_DST"/assets/index-*.css 2>/dev/null | head -1 || true)
    if [[ -n "$DST_CSS_N" ]] && grep -qF "$CSS_MARKER_ANY" "$DST_CSS_N" 2>/dev/null; then
      cp "$DST_CSS_N.patchbak" "$DST_CSS_N"
      echo "Normalized RTL copy CSS to pristine bytes."
    fi
    if grep -qF "$JS_MARKER" "$UI_DST/index.html" 2>/dev/null; then
      cp "$UI_DST/index.html.patchbak" "$UI_DST/index.html"
      echo "Normalized RTL copy index.html to pristine bytes."
    fi
    rm -f "$UI_DST/assets/rtl.js" "$UI_DST/assets/vazirmatn-wght.woff2"
    rm -f "$UI_DST"/assets/index-*.css.patchbak "$UI_DST/index.html.patchbak"
  fi

  # Give the copy its own identity so both editions can coexist: distinct
  # bundle name + display name + bundle identifier (executable name unchanged).
  SRC_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" \
    "$SRC_APP/Contents/Info.plist" 2>/dev/null || echo "com.freebuff.desktop")
  DST_ID="${SRC_ID}.rtl"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName $DST_NAME" \
    "$DST_APP/Contents/Info.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $DST_NAME" \
    "$DST_APP/Contents/Info.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $DST_ID" \
    "$DST_APP/Contents/Info.plist" >/dev/null
  echo "RTL identity: name=$DST_NAME id=$DST_ID"

  # Electron locates its helpers as
  #   Frameworks/<CFBundleName> Helper*.app/Contents/MacOS/<CFBundleName> Helper*
  # (ElectronMainDelegate::OverrideChildProcessPath). A renamed bundle MUST
  # rename the helper DIRS, the helper BINARIES and CFBundleExecutable too,
  # otherwise the copy crashes on launch with "Unable to find helper app".
  FW_DIR="$DST_APP/Contents/Frameworks"
  if [[ -d "$FW_DIR" ]]; then
    for helper in "$FW_DIR/$SRC_NAME Helper"*.app; do
      [[ -e "$helper" ]] || continue
      base="$(basename "$helper")"
      newbase="$DST_NAME${base#$SRC_NAME}"
      if [[ "$newbase" != "$base" ]]; then
        mv "$helper" "$FW_DIR/$newbase"
        echo "Renamed helper: $base -> $newbase"
      fi
      HPLIST="$FW_DIR/$newbase/Contents/Info.plist"
      if [[ -f "$HPLIST" ]]; then
        OLD_HD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$HPLIST" 2>/dev/null || echo "")
        if [[ -n "$OLD_HD" ]]; then
          /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${OLD_HD/#$SRC_NAME/$DST_NAME}" "$HPLIST" >/dev/null 2>&1 || true
        fi
        HID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$HPLIST" 2>/dev/null || echo "")
        if [[ -n "$HID" && "$HID" == "$SRC_ID"* ]]; then
          /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $DST_ID${HID#$SRC_ID}" "$HPLIST" >/dev/null 2>&1 || true
        fi
        OLDEXE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$HPLIST" 2>/dev/null || echo "")
        if [[ -n "$OLDEXE" && -f "$FW_DIR/$newbase/Contents/MacOS/$OLDEXE" ]]; then
          NEWEXE="$DST_NAME${OLDEXE#$SRC_NAME}"
          if [[ "$NEWEXE" != "$OLDEXE" ]]; then
            mv "$FW_DIR/$newbase/Contents/MacOS/$OLDEXE" "$FW_DIR/$newbase/Contents/MacOS/$NEWEXE"
            /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $NEWEXE" "$HPLIST" >/dev/null 2>&1 || true
            echo "Renamed helper binary: $OLDEXE -> $NEWEXE"
          fi
        fi
      fi
      # Sanity: the exact executable Electron will look for must exist.
      if [[ ! -f "$FW_DIR/$newbase/Contents/MacOS/${newbase%.app}" ]]; then
        echo "WARN: expected helper executable missing: $newbase/Contents/MacOS/${newbase%.app}" >&2
      fi
    done
  fi

  # Separate updater cache so the two editions never share download state.
  UPD_YML="$DST_APP/Contents/Resources/app-update.yml"
  if [[ -f "$UPD_YML" ]] && grep -q "^updaterCacheDirName:" "$UPD_YML" 2>/dev/null; then
    if ! grep -q "\-rtl['\"]\?$" "$UPD_YML" 2>/dev/null; then
      sed -i '' "s/^updaterCacheDirName: '\(.*\)'$/updaterCacheDirName: '\1-rtl'/" "$UPD_YML" 2>/dev/null || true
      echo "RTL updater cache dir separated (…-rtl)."
    fi
  fi
fi

# --- 3. Locate the UI dir (orchestrator serves ui/ from disk) ---------------
# In clone mode this is inside the RTL copy; the original is never touched.
UI_DIR="$TARGET_DIR/Contents/Resources/orchestrator/ui"
if [[ ! -d "$UI_DIR" ]]; then
  echo "ERROR: ui dir not found at $UI_DIR" >&2
  exit 1
fi

# --- 4. Locate the built CSS (hashed filename varies per release) -----------
CSS_FILE=$(ls "$UI_DIR"/assets/index-*.css 2>/dev/null | head -1 || true)
if [[ -z "$CSS_FILE" ]]; then
  echo "ERROR: no assets/index-*.css under $UI_DIR" >&2
  exit 1
fi
echo "Built CSS: $CSS_FILE"

# --- 5. Ship the font into assets (idempotent copy) -------------------------
FONT_DST="$UI_DIR/assets/vazirmatn-wght.woff2"
if [[ ! -f "$FONT_DST" ]] || ! cmp -s "$FONT_SRC" "$FONT_DST"; then
  cp "$FONT_SRC" "$FONT_DST"
  echo "Installed font -> $FONT_DST"
else
  echo "Font already present: $FONT_DST"
fi

# --- 6. Ship rtl.js into assets (idempotent copy) ---------------------------
JS_DST="$UI_DIR/assets/rtl.js"
if [[ ! -f "$JS_DST" ]] || ! cmp -s "$PATCH_JS" "$JS_DST"; then
  cp "$PATCH_JS" "$JS_DST"
  echo "Installed rtl.js -> $JS_DST"
else
  echo "rtl.js already present: $JS_DST"
fi

# --- 7. Append the CSS patch (idempotent via marker) ------------------------
if grep -qF "$CSS_MARKER" "$CSS_FILE"; then
  if [[ "$FORCE" -eq 1 ]]; then
    cp "$CSS_FILE.patchbak" "$CSS_FILE"
    echo "Stripped previous CSS patch (restored from .patchbak)."
  else
    echo "CSS patch $CSS_MARKER already applied; skipping."
    CSS_FILE="" # mark as done so we don't re-append below
  fi
elif grep -qF "$CSS_MARKER_ANY" "$CSS_FILE"; then
  if [[ "$FORCE" -eq 1 || "$MODE" == "clone" ]]; then
    if [[ -f "$CSS_FILE.patchbak" ]] && ! grep -qF "$CSS_MARKER_ANY" "$CSS_FILE.patchbak" 2>/dev/null; then
      cp "$CSS_FILE.patchbak" "$CSS_FILE"
      echo "Stripped stale CSS patch (restored pristine from .patchbak)."
    else
      echo "ERROR: CSS carries a stale patch version with no clean .patchbak." >&2
      echo "       Reinstall the pristine original, then re-run." >&2
      exit 1
    fi
  else
    echo "ERROR: CSS carries a stale patch version; re-run with --force." >&2
    exit 1
  fi
fi
if [[ -n "$CSS_FILE" ]]; then
  if [[ ! -f "$CSS_FILE.patchbak" ]]; then
    cp "$CSS_FILE" "$CSS_FILE.patchbak"
    echo "Backed up original CSS -> $CSS_FILE.patchbak"
  fi
  printf '\n%s\n' "$(cat "$PATCH_CSS")" >> "$CSS_FILE"
  echo "Patched $CSS_FILE"
fi

# --- 8. Inject rtl.js <script> into index.html (idempotent via marker) ------
INDEX="$UI_DIR/index.html"
if grep -qF "$JS_MARKER" "$INDEX"; then
  if [[ "$FORCE" -eq 1 ]]; then
    cp "$INDEX.patchbak" "$INDEX"
    echo "Stripped previous index.html patch (restored from .patchbak)."
  else
    echo "index.html patch already applied; skipping."
    INDEX=""
  fi
fi
if [[ -n "$INDEX" ]]; then
  if [[ ! -f "$INDEX.patchbak" ]]; then
    cp "$INDEX" "$INDEX.patchbak"
    echo "Backed up original index.html -> $INDEX.patchbak"
  fi
  # Inject rtl.js just before the app module script (registers its observer
  # before React renders). Fall back to before </head> if the module pattern
  # changed in a future release.
  if grep -q '<script type="module"' "$INDEX"; then
    sed -i '' "s|<script type=\"module\"|<script src=\"./assets/rtl.js\" defer></script>\n    <script type=\"module\"|" "$INDEX"
  else
    sed -i '' 's|</head>|<script src="./assets/rtl.js" defer></script>\n</head>|' "$INDEX"
  fi
  echo "Patched $INDEX (injected rtl.js script tag)"
fi

# --- 9. macOS quarantine sanity on shipped files ----------------------------
xattr -dr com.apple.quarantine "$FONT_DST" 2>/dev/null || true
xattr -dr com.apple.quarantine "$JS_DST" 2>/dev/null || true

# --- 9b. Re-sign the bundle so macOS does NOT flag it as "damaged" -----------
# Modifying bundle files (CSS/JS/index.html) breaks a valid code signature's
# sealed-resource check -> macOS shows "app is damaged". Re-sign the bundle
# ad-hoc (preserving embedded entitlements when present) to repair the seal.
# Unsigned apps (older releases) are skipped; only their quarantine is cleared.
resign_app() {
  local app="$1"
  local ent=""
  # Extract embedded entitlements (if any) into a real XML file — plain `-`
  # output and non---xml file output are only human-readable display format.
  # (The old `path:` form is deprecated and fails on newer toolchains.)
  ent="$(mktemp /tmp/fb.ent.XXXXXX.plist)"
  if codesign -d --xml --entitlements "$ent" "$app" >/dev/null 2>&1 \
      && [[ -s "$ent" ]] && grep -q "<dict" "$ent"; then
    echo "Re-signing bundle (ad-hoc, preserving entitlements)..."
    if codesign --force --deep --sign - --entitlements "$ent" "$app" >/dev/null 2>&1; then
      echo "  re-signed with entitlements"
    else
      echo "  entitlements re-sign failed; trying plain"
      codesign --force --deep --sign - "$app" >/dev/null 2>&1 \
        && echo "  signature applied" \
        || echo "  WARN: re-sign failed — app may still report damaged"
    fi
  else
    echo "No entitlements found; re-signing bundle (ad-hoc, plain)..."
    codesign --force --deep --sign - "$app" >/dev/null 2>&1 \
      && echo "  signature applied" \
      || echo "  WARN: re-sign failed — app may still report damaged"
  fi
  rm -f "$ent"
  # Clear quarantine on the whole bundle so Gatekeeper lets it launch.
  xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  xattr -cr "$app" 2>/dev/null || true
}
resign_app "$TARGET_DIR"

echo
if [[ "$MODE" == "clone" ]]; then
  echo "RTL edition built. Original untouched: $SRC_APP (v$APP_VER)"
  echo "RTL edition (patched):                $DST_APP (v$APP_VER)"
else
  echo "Patch applied in place. App: $TARGET_DIR (v$APP_VER)"
fi

# --- 10. Optionally relaunch and verify --------------------------------------
if [[ "$RELAUNCH" -eq 1 ]]; then
  echo "Relaunching $(basename "$TARGET_DIR" .app)..."
  open "$TARGET_DIR"
  sleep 7
  PORT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/bun/{print $9}' | sed 's/.*://' | head -1)
  if [[ -z "$PORT" ]]; then
    echo "WARN: could not find the orchestrator port after launch."
  else
    echo "Orchestrator port: $PORT"
    CSS_NAME=$(basename "$(ls "$UI_DIR"/assets/index-*.css 2>/dev/null | head -1)")
    css_ok=$(curl -s "http://127.0.0.1:$PORT/assets/$CSS_NAME" | grep -c Vazirmatn || true)
    js_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/assets/rtl.js" || true)
    html_ok=$(curl -s "http://127.0.0.1:$PORT/index.html" | grep -c 'assets/rtl.js' || true)
    echo "Verify: CSS Vazirmatn refs=$css_ok (expect >=1)"
    echo "Verify: rtl.js HTTP=$js_code (expect 200)"
    echo "Verify: index.html rtl.js refs=$html_ok (expect >=1)"
    if [[ "$css_ok" -ge 1 && "$js_code" == "200" && "$html_ok" -ge 1 ]]; then
      echo "ALL CHECKS PASSED."
    else
      echo "SOME CHECKS FAILED — see above. Check the app is running."
    fi
  fi
else
  echo "Launch the RTL edition to see changes:  open $TARGET_DIR"
fi

if [[ "$MODE" == "clone" ]]; then
  echo "After every ORIGINAL update, just re-run: bash patch/patch.sh --relaunch"
else
  echo "Re-run this script (with --relaunch) after every Freebuff update."
fi