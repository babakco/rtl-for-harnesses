#!/usr/bin/env python3
"""rtl2-icon.py — build the slightly different OpenCode-RTL-2 app icon.

Takes the app's own icon.icns (so the base art follows every upstream
release), overlays a small amber "۲" badge in the bottom-right corner, and
writes a new .icns via iconutil.

Usage:
    python3 rtl2-icon.py <base.icns> <out.icns>

Requires: python3 with Pillow (pip3 install pillow), sips, iconutil.
"""

import os
import shutil
import subprocess
import sys
import tempfile

def fail(message):
    print(f"rtl2-icon: {message}", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) != 3:
        fail("usage: python3 rtl2-icon.py <base.icns> <out.icns>")
    base_icns, out_icns = sys.argv[1], sys.argv[2]
    if not os.path.exists(base_icns):
        fail(f"missing base icon: {base_icns}")

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        fail("Pillow is required (pip3 install pillow)")

    workdir = tempfile.mkdtemp(prefix="rtl2-icon-")
    try:
        base_png = os.path.join(workdir, "base.png")
        subprocess.run(["sips", "-s", "format", "png", base_icns, "--out", base_png],
                       check=True, capture_output=True)
        image = Image.open(base_png).convert("RGBA")
        if image.size != (1024, 1024):
            image = image.resize((1024, 1024), Image.LANCZOS)
        width = image.width

        # Badge geometry: bottom-right corner, sized to stay legible in the Dock.
        radius = int(width * 0.145)
        center = (int(width * 0.79), int(width * 0.79))
        ring = int(width * 0.012)
        amber = (224, 163, 62, 255)
        dark = (22, 22, 22, 255)

        draw = ImageDraw.Draw(image)
        box = [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius]
        draw.ellipse(box, fill=amber, outline=dark, width=ring)

        font = load_digit_font(ImageFont, int(width * 0.185))
        label = "\u06f2"  # EXTENDED ARABIC-INDIC DIGIT TWO
        draw.text(center, label, font=font, fill=dark, anchor="mm", stroke_width=0)

        iconset = os.path.join(workdir, "RTL2.iconset")
        os.makedirs(iconset, exist_ok=True)
        for name, size in [
            ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
        ]:
            image.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, name))

        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out_icns],
                       check=True, capture_output=True)
        with open(out_icns, "rb") as handle:
            if handle.read(4) != b"icns":
                fail("iconutil produced an invalid icns")
        print(f"rtl2-icon: wrote {out_icns}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

def load_digit_font(ImageFont, size):
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, "Library", "Fonts", "Vazirmatn[wght].ttf"),
        os.path.join(home, "Library", "Fonts", "Vazirmatn-Regular.ttf"),
        "/Library/Fonts/Vazirmatn[wght].ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()

if __name__ == "__main__":
    main()
