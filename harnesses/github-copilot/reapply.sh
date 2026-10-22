#!/bin/bash
# reapply.sh — canonical one-command (re)application of the RTL patch.
# Always applies the patch exactly the same way:
#   1. ./build.sh   (embed fonts -> payload-built.js, node --check, compile dylib)
#   2. ./patch.sh   (backup once, install dylib+payload, ad-hoc re-sign)
# Use after every app update, or whenever you want a guaranteed-clean state.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/build.sh"
"$DIR/patch.sh"
echo "==> REAPPLY DONE. Launch with: ./launch-copilot-rtl.sh"
