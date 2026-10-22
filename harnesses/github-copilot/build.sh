#!/bin/bash
# build.sh — build the RTL payload (embed Vazirmatn) + compile the injector dylib
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_SRC="$DIR/payload/copilot-rtl-payload.js"
PAYLOAD_BUILT="$DIR/payload/copilot-rtl-payload-built.js"
FONT_REG="$DIR/payload/fonts/Vazirmatn-Regular.woff2"
FONT_BOLD="$DIR/payload/fonts/Vazirmatn-Bold.woff2"
DYLIB="$DIR/injector/copilot_rtl_inject.dylib"

echo "==> [1/3] Embedding Vazirmatn fonts into payload..."
python3 - "$PAYLOAD_SRC" "$PAYLOAD_BUILT" "$FONT_REG" "$FONT_BOLD" <<'EOF'
import base64, sys
src_path, out_path, reg_path, bold_path = sys.argv[1:5]
src = open(src_path, encoding='utf-8').read()
assert '__VAZIRMATN_REGULAR_B64__' in src and '__VAZIRMATN_BOLD_B64__' in src, "font placeholders missing"
reg = base64.b64encode(open(reg_path,'rb').read()).decode()
bold = base64.b64encode(open(bold_path,'rb').read()).decode()
out = src.replace('__VAZIRMATN_REGULAR_B64__', reg).replace('__VAZIRMATN_BOLD_B64__', bold)
open(out_path,'w',encoding='utf-8').write(out)
print(f"    payload-built.js: {len(out)//1024} KB (fonts embedded)")
EOF

echo "==> [2/3] Syntax check (node --check)..."
node --check "$PAYLOAD_BUILT" && echo "    JS syntax OK"
node --check "$PAYLOAD_SRC" && echo "    JS template syntax OK"

echo "==> [3/3] Compiling injector dylib (clang)..."
MIN_MACOS="${MACOSX_DEPLOYMENT_TARGET:-12.0}"
ARCH="${RTL_ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64|x86_64) ;;
  *) echo "ERROR: unsupported architecture: $ARCH (use arm64 or x86_64)"; exit 1 ;;
esac
clang -dynamiclib -O2 -arch "$ARCH" \
  -mmacosx-version-min="$MIN_MACOS" \
  -install_name "@loader_path/copilot_rtl_inject.dylib" \
  -framework Foundation -framework WebKit \
  -o "$DYLIB" "$DIR/injector/copilot_rtl_inject.m"
echo "    dylib: $DYLIB ($ARCH)"
file "$DYLIB"
echo "==> BUILD DONE"
