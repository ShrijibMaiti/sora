"""Render the app icons (web/public/icons) from the hexmark in src/components/Icon.tsx. Run: python web/scripts/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG, FG = (18, 19, 22), (122, 165, 255)  # --bg-canvas (dark), --brand-text
# hexmark cells (centre x, centre y, opacity) on its 24-unit grid; each hexagon is 6 wide, 7 tall
CELLS = [(8, 7, 1.0), (16, 7, 0.55), (12, 13.8, 1.0)]


def hexagon(cx, cy, s):
    return [(cx, cy - 3.5 * s), (cx + 3 * s, cy - 1.8 * s), (cx + 3 * s, cy + 1.8 * s), (cx, cy + 3.5 * s),
            (cx - 3 * s, cy + 1.8 * s), (cx - 3 * s, cy - 1.8 * s)]


def icon(size, pad):
    """pad = share of the canvas kept clear on each side (maskable icons need ~20%)."""
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img, "RGBA")
    span = size * (1 - 2 * pad)
    s = span / 16  # the mark spans x 5..19 and y 3.5..17.3 of its grid
    ox, oy = size / 2 - 12 * s, size / 2 - 10.4 * s
    for cx, cy, a in CELLS:
        d.polygon(hexagon(ox + cx * s, oy + cy * s, s), fill=(*FG, int(255 * a)))
    return img


OUT.mkdir(parents=True, exist_ok=True)
for name, size, pad in (("icon-192.png", 192, 0.14), ("icon-512.png", 512, 0.14), ("maskable-512.png", 512, 0.24),
                        ("apple-touch-icon.png", 180, 0.14)):
    icon(size, pad).save(OUT / name, optimize=True)
    print("wrote", OUT / name)
