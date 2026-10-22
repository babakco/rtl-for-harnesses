#!/usr/bin/env bash
# apply-rtl-patch.sh — build "Antigravity RTL.app" from the original app.
#
#   tools/apply-rtl-patch.sh [--source APP] [--target APP] [--no-launch]
#
# Re-runnable: re-running replaces the previous patch, never duplicates it.
# The source app is NEVER modified; everything happens on the target copy.
# Re-run after every Antigravity update (update the original first).
#
# Exit codes: 0 ok | 2 usage/source error | 3 tooling error | 4 patch/verify error
set -euo pipefail

MARKER="ANTIGRAVITY_RTL_HOOK"
SOURCE="/Applications/Antigravity.app"
TARGET="/Applications/Antigravity RTL.app"
LAUNCH=1

usage() {
  cat <<'EOF'
Usage: apply-rtl-patch.sh [--source APP] [--target APP] [--no-launch]

  --source APP   Original Antigravity.app (default: /Applications/Antigravity.app)
  --target APP   RTL copy to (re)build   (default: /Applications/Antigravity RTL.app)
  --no-launch    Do not open the patched app when done
  -h, --help     Show this help

Exit codes: 0 ok | 2 usage/source error | 3 tooling error | 4 patch/verify error
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source)
      [ $# -ge 2 ] || { echo "error: --source needs a value" >&2; exit 2; }
      SOURCE="$2"; shift 2 ;;
    --target)
      [ $# -ge 2 ] || { echo "error: --target needs a value" >&2; exit 2; }
      TARGET="$2"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$SOURCE" ] || { echo "error: --source is empty" >&2; exit 2; }
[ -n "$TARGET" ] || { echo "error: --target is empty" >&2; exit 2; }
[ "$SOURCE" != "$TARGET" ] || { echo "error: source and target must differ" >&2; exit 2; }

if [ "$(uname)" != "Darwin" ]; then
  echo "error: this patch targets macOS .app bundles only" >&2
  exit 3
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing required command: $1" >&2
    exit 3
  }
}
require_cmd rsync
require_cmd npx
require_cmd codesign
require_cmd python3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS="$REPO_ROOT/assets"
[ -f "$ASSETS/rtl-inject.js" ] || { echo "error: missing asset: $ASSETS/rtl-inject.js" >&2; exit 3; }
[ -f "$ASSETS/rtl.css" ] || { echo "error: missing asset: $ASSETS/rtl.css" >&2; exit 3; }
[ -f "$ASSETS/preload-hook.js" ] || { echo "error: missing asset: $ASSETS/preload-hook.js" >&2; exit 3; }

SRC_ASAR="$SOURCE/Contents/Resources/app.asar"
[ -f "$SRC_ASAR" ] || { echo "error: source app.asar not found: $SRC_ASAR" >&2; exit 2; }
TGT_ASAR="$TARGET/Contents/Resources/app.asar"

# Refuse dangerous targets BEFORE anything destructive (review I4).
# Canonicalize (target may not exist yet; realpath is lexical then).
SRC_REAL="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$SOURCE")" || exit 3
TGT_REAL="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$TARGET")" || exit 3
python3 - "$SRC_REAL" "$TGT_REAL" "${HOME:-}" <<'PYEOF' || exit 2
import sys
src, tgt, home = sys.argv[1], sys.argv[2], sys.argv[3]
def bad(msg):
    sys.stderr.write("error: refusing unsafe --target: %s\n" % msg)
    sys.exit(2)
protected = ["/", "/Applications"]
if home:
    protected.append(home)
if tgt in protected:
    bad("target must be an app bundle path, got %r" % tgt)
if tgt == src:
    bad("source and target resolve to the same path")
if tgt.startswith(src.rstrip("/") + "/"):
    bad("target is inside source")
if src.startswith(tgt.rstrip("/") + "/"):
    bad("source is inside target")
PYEOF

echo "[1/7] Copying source -> target ..."
rsync -a --delete "$SOURCE/" "$TARGET/" || exit 4
/usr/bin/xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

# Distinct bundle identity: sharing the original bundle id/name makes macOS
# treat both apps as one (wrong app can open via LaunchServices). The RTL copy
# gets its own id and name for LaunchServices identity, BUT userData is still
# shared with the original app (userData derives from the asar package.json
# name, which is unchanged) and a single-instance lock applies — only one
# Antigravity instance can run at a time.
# NOTE: Electron resolves helper apps by NAME from CFBundleName
# (<Name> Helper*.app), so helper dirs + executables must be renamed to
# match — otherwise the app dies at startup with "Unable to find helper app".
# Bundle ids are re-prefixed too (electron-builder convention).
echo "[1/7] Renaming bundle identity ..."
python3 - "$SOURCE" "$TARGET" <<'PYEOF' || exit 4
import os
import plistlib
import sys

source, target = sys.argv[1], sys.argv[2]

with open(source + "/Contents/Info.plist", "rb") as f:
    src_info = plistlib.load(f)
src_id = src_info["CFBundleIdentifier"]
src_name = src_info.get("CFBundleName", "Antigravity")
tgt_id = src_id + ".rtl"
tgt_name = src_name + " RTL"

fw = os.path.join(target, "Contents", "Frameworks")
renamed_helpers = 0
if os.path.isdir(fw):
    for entry in sorted(os.listdir(fw)):
        src_prefix = src_name + " Helper"
        if not (entry.endswith(".app") and entry.startswith(src_prefix)):
            continue
        suffix = entry[len(src_name):-len(".app")]  # e.g. " Helper (GPU)"
        new_entry = tgt_name + suffix + ".app"
        old_exec = entry[: -len(".app")]
        new_exec = tgt_name + suffix
        old_dir = os.path.join(fw, entry)
        new_dir = os.path.join(fw, new_entry)
        os.rename(old_dir, new_dir)
        old_bin = os.path.join(new_dir, "Contents", "MacOS", old_exec)
        new_bin = os.path.join(new_dir, "Contents", "MacOS", new_exec)
        if os.path.isfile(old_bin):
            os.rename(old_bin, new_bin)
        helper_plist = os.path.join(new_dir, "Contents", "Info.plist")
        if os.path.isfile(helper_plist):
            with open(helper_plist, "rb") as f:
                hinfo = plistlib.load(f)
            if hinfo.get("CFBundleExecutable") == old_exec:
                hinfo["CFBundleExecutable"] = new_exec
                with open(helper_plist, "wb") as f:
                    plistlib.dump(hinfo, f)
        renamed_helpers += 1

def retitle(plist_path, new_id=None):
    with open(plist_path, "rb") as f:
        info = plistlib.load(f)
    changed = False
    bid = info.get("CFBundleIdentifier", "")
    if new_id is not None and bid != new_id:
        info["CFBundleIdentifier"] = new_id
        changed = True
    elif bid.startswith(src_id + ".") or bid == src_id:
        info["CFBundleIdentifier"] = tgt_id + bid[len(src_id):]
        changed = True
    if changed:
        with open(plist_path, "wb") as f:
            plistlib.dump(info, f)
    return changed

main_plist = target + "/Contents/Info.plist"
retitle(main_plist, new_id=tgt_id)
with open(main_plist, "rb") as f:
    info = plistlib.load(f)
info["CFBundleName"] = tgt_name
info["CFBundleDisplayName"] = tgt_name
with open(main_plist, "wb") as f:
    plistlib.dump(info, f)

reid = 0
for dirpath, _dirnames, filenames in os.walk(target):
    if "Info.plist" in filenames and dirpath != target + "/Contents":
        p = os.path.join(dirpath, "Info.plist")
        try:
            if retitle(p):
                reid += 1
        except Exception as e:  # noqa: BLE001 — keep going, verify later
            print("warning: could not retitle %s: %s" % (p, e))
print("bundle identity: %s -> %s (%d helpers renamed, %d bundle ids re-prefixed)"
      % (src_id, tgt_id, renamed_helpers, reid))
PYEOF

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[2/7] Extracting app.asar ..."
npx --yes asar extract "$TGT_ASAR" "$WORK/app" >/dev/null || exit 4

echo "[3/7] Composing self-contained preload hook (sandbox-safe inline) ..."
export AG_ASSETS="$ASSETS" AG_WORK="$WORK/app"
python3 - <<'PYEOF' || exit 4
import json
import os

assets = os.environ["AG_ASSETS"]
work = os.environ["AG_WORK"]

css = open(os.path.join(assets, "rtl.css"), encoding="utf-8").read()
src = open(os.path.join(assets, "rtl-inject.js"), encoding="utf-8").read()
placeholder = 'const AG_RTL_CSS = "";'
assert placeholder in src, "placeholder missing in rtl-inject.js"
injector = src.replace(
    placeholder,
    "const AG_RTL_CSS = " + json.dumps(css, ensure_ascii=True) + ";",
    1,
)
assert "require(" not in injector, "injector must stay sandbox-safe (no require()"

hook = open(os.path.join(assets, "preload-hook.js"), encoding="utf-8").read()
assert hook.count("ANTIGRAVITY_RTL_HOOK") == 1, "marker must appear exactly once in template"
assert hook.count("/*__AG_RTL_INJECTOR__*/") == 1, "injector placeholder missing/not unique"
assert "require(" not in hook, "hook template must stay sandbox-safe (no require()"
composed = hook.replace("/*__AG_RTL_INJECTOR__*/", injector, 1)
assert "PERSIAN_RE" in composed, "composed hook missing injector"
assert "Vazirmatn" in composed, "composed hook missing inlined CSS"

dist = os.path.join(work, "dist")
assert os.path.isdir(dist), "dist/ missing in extracted asar"
# NOTE (review I2): no strip-and-replace of a previous hook. The target is
# always rebuilt from pristine source by rsync --delete above, so a prior
# hook cannot exist — appending is sufficient and keeps one code path.
# v3: self-contained inline — no dist/rtl-inject.js or dist/rtl.css anymore.
preload = os.path.join(dist, "preload.js")
assert os.path.isfile(preload), "dist/preload.js missing in extracted asar"
with open(preload, encoding="utf-8") as f:
    content = f.read()
if not content.endswith("\n"):
    content += "\n"
if not composed.endswith("\n"):
    composed += "\n"
with open(preload, "w", encoding="utf-8") as f:
    f.write(content + composed)
print("self-contained preload hook ready")
PYEOF

echo "[4/7] Re-packing app.asar ..."
npx --yes asar pack "$WORK/app" "$TGT_ASAR" >/dev/null || exit 4

echo "[5/7] Re-signing (ad-hoc) ..."
codesign --force --deep --sign - "$TARGET" || exit 4

echo "[6/7] Verifying ..."
VERIFY_DIR="$(mktemp -d)"
npx --yes asar extract "$TGT_ASAR" "$VERIFY_DIR" >/dev/null || exit 4
count="$(grep -c "$MARKER" "$VERIFY_DIR/dist/preload.js" || true)"
[ "$count" = "1" ] || {
  echo "error: hook marker count=$count (want 1)" >&2
  rm -rf "$VERIFY_DIR"
  exit 4
}
grep -q "PERSIAN_RE" "$VERIFY_DIR/dist/preload.js" || {
  echo "error: inlined injector missing (PERSIAN_RE)" >&2
  rm -rf "$VERIFY_DIR"
  exit 4
}
grep -q "Vazirmatn" "$VERIFY_DIR/dist/preload.js" || {
  echo "error: CSS not inlined (Vazirmatn)" >&2
  rm -rf "$VERIFY_DIR"
  exit 4
}
if grep -q 'require("./rtl-inject.js")' "$VERIFY_DIR/dist/preload.js"; then
  echo "error: stale local require found" >&2
  rm -rf "$VERIFY_DIR"
  exit 4
fi
python3 - "$VERIFY_DIR/dist/preload.js" "$MARKER" <<'PYEOF' || { rm -rf "$VERIFY_DIR"; exit 4; }
import sys
path, marker = sys.argv[1], sys.argv[2]
s = open(path, encoding="utf-8").read()
idx = s.find(marker)
assert idx != -1, "marker missing"
after = s[idx:]
assert "require(" not in after, "composed section after marker must not contain require("
print("verify: composed hook is sandbox-safe (no require() after marker)")
PYEOF
rm -rf "$VERIFY_DIR"
codesign --verify "$TARGET" || {
  echo "error: codesign verify failed" >&2
  exit 4
}

echo "[7/7] Done: $TARGET"
if [ "$LAUNCH" = "1" ]; then
  open "$TARGET" || echo "warning: patch succeeded but 'open' failed — launch manually" >&2
fi
