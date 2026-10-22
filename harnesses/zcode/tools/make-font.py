#!/usr/bin/env python3
"""Convert the Vazirmatn variable TTF to WOFF2 for embedding in the app bundle.

Only .woff2 is served with a font MIME type by the DSH static asset handler
(see MIME map in lib/main.js), so a .ttf would be rejected by the renderer.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
font = TTFont(src, recalcBBoxes=False, recalcTimestamp=False)
font.flavor = "woff2"
dst.parent.mkdir(parents=True, exist_ok=True)
font.save(dst)
print(f"{src} -> {dst}  ({dst.stat().st_size} bytes)")
