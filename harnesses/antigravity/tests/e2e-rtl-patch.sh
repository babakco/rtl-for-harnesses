#!/usr/bin/env bash
# Fixture end-to-end test for tools/apply-rtl-patch.sh.
# Builds a fake .app in $TMPDIR — never touches /Applications.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="$REPO_ROOT/tools/apply-rtl-patch.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FIX_SRC="$WORK/fixture-src"
FIX_APP="$WORK/Source.app"
FIX_TARGET="$WORK/Target.app"

mkdir -p "$FIX_SRC/dist" "$FIX_APP/Contents/Resources"
cat > "$FIX_SRC/package.json" <<'EOF'
{"name": "fixture", "version": "0.0.0", "main": "dist/main.js"}
EOF
cat > "$FIX_SRC/dist/preload.js" <<'EOF'
"use strict";
// fixture preload — simulates the host app's preload
EOF

npx --yes asar pack "$FIX_SRC" "$FIX_APP/Contents/Resources/app.asar" >/dev/null

# Minimal bundle structure so ad-hoc codesign accepts the fixture like a real app.
mkdir -p "$FIX_APP/Contents/MacOS"
cat > "$FIX_APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>fixture</string>
  <key>CFBundleIdentifier</key><string>com.example.rtl-fixture</string>
  <key>CFBundleName</key><string>fixture</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
EOF
printf '#!/bin/sh\nexit 0\n' > "$FIX_APP/Contents/MacOS/fixture"
chmod +x "$FIX_APP/Contents/MacOS/fixture"

# Fake helper mirroring the real bundle layout (pins the helper-rename path:
# Electron resolves helpers by NAME from CFBundleName).
mkdir -p "$FIX_APP/Contents/Frameworks/fixture Helper.app/Contents/MacOS"
cat > "$FIX_APP/Contents/Frameworks/fixture Helper.app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>fixture Helper</string>
  <key>CFBundleIdentifier</key><string>com.example.rtl-fixture.helper</string>
  <key>CFBundleName</key><string>fixture Helper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
EOF
printf '#!/bin/sh\nexit 0\n' > "$FIX_APP/Contents/Frameworks/fixture Helper.app/Contents/MacOS/fixture Helper"
chmod +x "$FIX_APP/Contents/Frameworks/fixture Helper.app/Contents/MacOS/fixture Helper"

# --- run 1 ---
bash "$PATCH" --source "$FIX_APP" --target "$FIX_TARGET" --no-launch
[ -d "$FIX_TARGET" ] || { echo "FAIL: target missing"; exit 1; }

EXT1="$WORK/ext-source"
EXT2="$WORK/ext-target"
npx --yes asar extract "$FIX_APP/Contents/Resources/app.asar" "$EXT1" >/dev/null
npx --yes asar extract "$FIX_TARGET/Contents/Resources/app.asar" "$EXT2" >/dev/null

# 1. source is untouched
if grep -rq "ANTIGRAVITY_RTL_HOOK" "$EXT1"; then
  echo "FAIL: source asar was modified"
  exit 1
fi

# 2. target is patched exactly once, self-contained inline (no sidecar files)
[ ! -f "$EXT2/dist/rtl-inject.js" ] || { echo "FAIL: stale dist/rtl-inject.js should not exist (v3 inline)"; exit 1; }
[ ! -f "$EXT2/dist/rtl.css" ] || { echo "FAIL: stale dist/rtl.css should not exist (v3 inline)"; exit 1; }
count="$(grep -c "ANTIGRAVITY_RTL_HOOK" "$EXT2/dist/preload.js" || true)"
[ "$count" = "1" ] || { echo "FAIL: marker count=$count (want 1)"; exit 1; }
grep -q "PERSIAN_RE" "$EXT2/dist/preload.js" || { echo "FAIL: injector not inlined (PERSIAN_RE)"; exit 1; }
grep -q "Vazirmatn" "$EXT2/dist/preload.js" || { echo "FAIL: CSS not inlined (Vazirmatn)"; exit 1; }
if grep -q 'require("./rtl-inject.js")' "$EXT2/dist/preload.js"; then echo "FAIL: stale local require found"; exit 1; fi
python3 - "$EXT2/dist/preload.js" <<'PYEOF' || exit 1
import sys
s = open(sys.argv[1], encoding="utf-8").read()
after = s[s.find("ANTIGRAVITY_RTL_HOOK"):]
assert "require(" not in after, "composed hook must not contain require("
PYEOF

# 2b. helper renamed by NAME (dir + executable) and re-prefixed by id
HELP_PLIST="$FIX_TARGET/Contents/Frameworks/fixture RTL Helper.app/Contents/Info.plist"
[ -x "$FIX_TARGET/Contents/Frameworks/fixture RTL Helper.app/Contents/MacOS/fixture RTL Helper" ] || { echo "FAIL: helper executable not renamed"; exit 1; }
[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$HELP_PLIST")" = "com.example.rtl-fixture.rtl.helper" ] || { echo "FAIL: helper id not re-prefixed"; exit 1; }
[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$HELP_PLIST")" = "fixture RTL Helper" ] || { echo "FAIL: helper executable field not updated"; exit 1; }
[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$FIX_TARGET/Contents/Info.plist")" = "com.example.rtl-fixture.rtl" ] || { echo "FAIL: main id not renamed"; exit 1; }

# 3. idempotency: second run keeps the count at 1
bash "$PATCH" --source "$FIX_APP" --target "$FIX_TARGET" --no-launch
rm -rf "$EXT2"
npx --yes asar extract "$FIX_TARGET/Contents/Resources/app.asar" "$EXT2" >/dev/null
count2="$(grep -c "ANTIGRAVITY_RTL_HOOK" "$EXT2/dist/preload.js" || true)"
[ "$count2" = "1" ] || { echo "FAIL: not idempotent (count=$count2)"; exit 1; }

echo "E2E PASS"
