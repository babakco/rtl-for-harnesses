#!/bin/bash
# uninstall.sh — restore the pristine GitHub Copilot.app from backup
set -euo pipefail
APP="/Applications/GitHub Copilot.app"
BACKUP_APP="$HOME/CopilotRTLBackup/GitHub Copilot.app"

if [ ! -d "$BACKUP_APP" ]; then
  echo "ERROR: no backup at $BACKUP_APP"
  echo "Re-download the app from GitHub instead."
  exit 1
fi
pkill -f "GitHub Copilot.app/Contents/MacOS/github" 2>/dev/null || true
sleep 1
echo "==> Restoring pristine app (needs sudo for /Applications)..."
if [ -w "/Applications" ]; then
  rm -rf "$APP" && ditto "$BACKUP_APP" "$APP"
else
  sudo rm -rf "$APP" && sudo ditto "$BACKUP_APP" "$APP"
fi
echo "==> Restored. Signature check:"
codesign -dvv "$APP" 2>&1 | head -n 8 || true
