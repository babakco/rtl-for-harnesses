#!/bin/bash
# launch-copilot-rtl.sh — launch GitHub Copilot.app with the RTL injector
set -euo pipefail
APP="/Applications/GitHub Copilot.app"
DYLIB="$APP/Contents/Frameworks/CopilotRTL/copilot_rtl_inject.dylib"
BIN="$APP/Contents/MacOS/github"

if [ ! -f "$DYLIB" ]; then
  echo "ERROR: injector not installed. Run ./patch.sh first."
  exit 1
fi
pkill -f "GitHub Copilot.app/Contents/MacOS/github" 2>/dev/null || true
sleep 1
echo "Launching GitHub Copilot with RTL patch..."
DYLD_INSERT_LIBRARIES="$DYLIB" exec "$BIN"
