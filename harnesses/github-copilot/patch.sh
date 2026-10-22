#!/bin/bash
# patch.sh — install the RTL patch into /Applications/GitHub Copilot.app
#
# Steps:
#   1. Quit the app
#   2. Back up the pristine app (once) to ~/CopilotRTLBackup/
#   3. Copy dylib + built payload into Contents/Frameworks/CopilotRTL/
#   4. Clear quarantine xattrs, ad-hoc re-sign (drops Hardened Runtime +
#      Library Validation so DYLD_INSERT_LIBRARIES works). No SIP change needed.
#   5. Verify signature
#
# Restore anytime with ./uninstall.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="/Applications/GitHub Copilot.app"
BACKUP_DIR="$HOME/CopilotRTLBackup"
BACKUP_APP="$BACKUP_DIR/GitHub Copilot.app"
DEST="$APP/Contents/Frameworks/CopilotRTL"

if [ ! -d "$APP" ]; then echo "ERROR: $APP not found"; exit 1; fi
[ -f "$DIR/injector/copilot_rtl_inject.dylib" ] || { echo "ERROR: run ./build.sh first"; exit 1; }
[ -f "$DIR/payload/copilot-rtl-payload-built.js" ] || { echo "ERROR: run ./build.sh first"; exit 1; }

echo "==> Quitting GitHub Copilot (if running)..."
pkill -f "GitHub Copilot.app/Contents/MacOS/github" 2>/dev/null || true
sleep 1

if [ ! -d "$BACKUP_APP" ]; then
  echo "==> Backing up pristine app to $BACKUP_APP ..."
  mkdir -p "$BACKUP_DIR"
  ditto "$APP" "$BACKUP_APP"
  echo "    backup done ($(du -sh "$BACKUP_APP" | cut -f1))"
else
  echo "==> Backup already exists, skipping."
fi

echo "==> Installing dylib + payload into $DEST ..."
mkdir -p "$DEST"
cp -f "$DIR/injector/copilot_rtl_inject.dylib" "$DEST/"
cp -f "$DIR/payload/copilot-rtl-payload-built.js" "$DEST/copilot-rtl-payload.js"
cp -f "$DIR/payload/fonts/OFL.txt" "$DEST/" 2>/dev/null || true

echo "==> Clearing quarantine attributes..."
xattr -cr "$APP" 2>/dev/null || true

echo "==> Ad-hoc re-signing (removes Hardened Runtime / Library Validation)..."
codesign --force --deep --sign - "$APP"

echo "==> Verifying..."
codesign -dvv "$APP" 2>&1 | grep -E "Identifier|Signature|runtime" || true
if codesign -dvv "$APP" 2>&1 | grep -q "flags=0x10000(runtime)"; then
  echo "WARNING: hardened runtime still present — injection may be blocked."
else
  echo "    OK: no hardened-runtime flag; DYLD injection allowed."
fi
echo "==> PATCH INSTALLED. Launch with: ./launch-copilot-rtl.sh"
