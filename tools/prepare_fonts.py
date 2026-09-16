#!/usr/bin/env python3
"""
Convert the vendored web fonts (woff2) into TTFs for Pillow.

The converted TTFs are committed in assets/fonts, so a normal build needs
nothing from this script. Run it only when adding/updating a font family.

  python3 tools/prepare_fonts.py --src /path/to/node_modules/@fontsource

Sources are the @fontsource npm packages (Google Fonts, OFL licensed):
  montserrat, inter, teko            - Latin subsets (poster + booklet Latin)
  ibm-plex-sans-arabic               - Arabic (booklet text)
  noto-sans-arabic                   - Arabic fallback

Note: the @fontsource Arabic subsets carry no Latin digits or punctuation, so
mixed lines are drawn run-by-run (see tools/rtl_text.py). Choose Arabic fonts
with full presentation-form coverage - Cairo, for example, is missing common
isolated/final forms and will render disconnected letters.
"""

from __future__ import annotations

import argparse
import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "fonts")

FAMILIES = {
    "montserrat": ("Montserrat", "latin", [400, 500, 600, 700, 800, 900]),
    "inter": ("Inter", "latin", [400, 500, 600, 700, 800]),
    "teko": ("Teko", "latin", [400, 500, 600, 700]),
    "ibm-plex-sans-arabic": ("IBMPlexSansArabic", "arabic", [400, 500, 600, 700]),
    "noto-sans-arabic": ("NotoSansArabic", "arabic", [400, 700]),
}


def convert(src_root: str) -> int:
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for pkg, (name, subset, weights) in FAMILIES.items():
        for w in weights:
            src = os.path.join(src_root, pkg, "files", f"{pkg}-{subset}-{w}-normal.woff2")
            if not os.path.exists(src):
                print(f"  skip  {name}-{w}: no {os.path.basename(src)}")
                continue
            font = TTFont(src)
            font.flavor = None
            dst = os.path.join(OUT, f"{name}-{w}.ttf")
            font.save(dst)
            cmap = set(font.getBestCmap().keys())
            arabic = sum(1 for c in range(0x0600, 0x0700) if c in cmap)
            forms = sum(1 for c in range(0xFE70, 0xFF00) if c in cmap)
            print(f"  ok    {os.path.basename(dst):28s} {os.path.getsize(dst)/1024:5.0f}KB"
                  f"  arabic:{arabic:3d} forms:{forms:3d}")
            made += 1
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(os.path.expanduser("~"), ".render",
                                                  "node_modules", "@fontsource"),
                    help="path to the node_modules/@fontsource directory")
    args = ap.parse_args()
    if not os.path.isdir(args.src):
        raise SystemExit(f"source directory not found: {args.src}\n"
                         f"install with: npm i @fontsource/montserrat @fontsource/inter "
                         f"@fontsource/teko @fontsource/cairo @fontsource/noto-naskh-arabic")
    print(f"converting from {args.src}")
    n = convert(args.src)
    print(f"{n} fonts written to assets/fonts")


if __name__ == "__main__":
    main()
