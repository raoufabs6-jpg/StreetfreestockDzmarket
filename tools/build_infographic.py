#!/usr/bin/env python3
"""
PROJECT HYBRID - 16:9 infographic renderer.

Pure Pillow vector/raster compositing: everything (cards, icons, charts,
typography, anatomy compositing) is generated from code.

  python3 tools/build_infographic.py            # 3840 x 2160 PNG + PDF
  python3 tools/build_infographic.py --scale 1  # 2560 x 1440

Layout is authored in a 2560 x 1440 "base" coordinate space and multiplied
by SCALE at draw time, so the design stays pixel-proportional.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx  # noqa: E402
from gfx import (P, aa_polyline, aa_round_rect, alpha_ramp, card_panel,  # noqa: E402
                 font, gradient_h, gradient_v, hline, icon, load_figure, paste_fit,
                 put, round_rect, set_scale, text_w, truncate, validate_glyphs,
                 vline, wrap)
from plan_data import DAYS, LEGEND, META, PROFILE, SYSTEM  # noqa: E402

ROOT = gfx.ROOT
ASSETS = gfx.ASSETS
RAW = gfx.RAW
PROCESSED = gfx.PROCESSED
FONTS = gfx.FONTS
OUT_DIR = os.path.join(ROOT, "output")

# --------------------------------------------------------------------------
# design tokens
# --------------------------------------------------------------------------
BASE_W, BASE_H = 2560, 1440

BG = (18, 18, 18)              # #121212 matte black
CARD_TOP = gfx.CARD_TOP        # card gradient
CARD_BOT = gfx.CARD_BOT
CARD_BG = gfx.CARD_BG          # flat card colour used to key out figure plates
WHITE = (255, 255, 255)
TXT = (243, 246, 247)
TXT2 = (168, 177, 182)
TXT3 = (124, 133, 138)
HAIR = (255, 255, 255)

ACCENTS = {
    "gold": (255, 215, 0),      # #FFD700
    "cyan": (0, 229, 255),      # #00E5FF
    "rest": (154, 166, 173),    # steel - neutral recovery
    "mix": (255, 215, 0),
}


def accent_of(day):
    return ACCENTS[day["accent"]]


def mix_tone(tone, alpha=1.0):
    c = ACCENTS[tone]
    return tuple(list(c) + [int(255 * alpha)])


PAD = 52        # outer page margin
GUT = 20        # gutter between cards
HEADER_Y = 396  # content grid starts below this
FOOT_Y = 1392   # footer rule


# --------------------------------------------------------------------------
# anatomy figures
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# components
# --------------------------------------------------------------------------
def draw_background(canvas):
    W, H = P(BASE_W), P(BASE_H)
    bg = Image.new("RGBA", (W, H), BG + (255,))
    # very subtle vignette + faint grid for the "sports-science" texture
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.28
    d = np.sqrt(((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2)
    vig = np.clip(1.0 - d * 0.9, 0.55, 1.0)
    arr = np.asarray(bg).astype(np.float32)
    arr[:, :, :3] *= vig[..., None]
    canvas.alpha_composite(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"))


def draw_day_chip(dst, right_x, y, label, color):
    w = text_w(label, "Montserrat", 700, 9.6, 1.7) + 20
    h = 21
    round_rect(dst, (right_x - w, y, right_x, y + h), 5,
               fill=color + (30,), outline=color + (105,), width=1)
    put(dst, (right_x - w / 2, y + h / 2 + 0.5), label, "Montserrat", 700, 9.6, color + (255,),
        tracking=1.7, anchor="cm")
    return w


def draw_card_header(dst, x, y, w, day, icon_names):
    acc = accent_of(day)
    if day["accent"] == "mix":
        acc = ACCENTS["gold"]
    # icon badge
    badge = 30
    round_rect(dst, (x + 26, y + 20, x + 26 + badge, y + 20 + badge), 9,
               fill=acc + (28,), outline=acc + (95,), width=1)
    ic = icon(day["icon"], P(15), acc + (255,))
    dst.alpha_composite(ic, (P(x + 26 + badge / 2) - ic.width // 2, P(y + 20 + badge / 2) - ic.height // 2))

    put(dst, (x + 68, y + 35), day["day"], "Montserrat", 800, 23, TXT + (255,),
        tracking=2.4, anchor="lm")
    draw_day_chip(dst, x + w - 26, y + 25, day["type"], acc)
    put(dst, (x + 26, y + 62), day["focus"], "Inter", 500, 12.2, TXT2 + (255,), tracking=0.15)
    hline(dst, x + 26, x + w - 26, y + 86, (255, 255, 255, 24))


def draw_exercise(dst, x, y, tw, i, ex, acc):
    """x,y = top-left of the text column; tw = available text width."""
    ry = y
    # number badge
    round_rect(dst, (x, ry + 1, x + 20, ry + 21), 6, fill=acc + (24,), outline=acc + (80,), width=1)
    put(dst, (x + 10, ry + 11.5), str(i + 1), "Montserrat", 700, 10.5, acc + (255,), anchor="cm")

    tw = tw - 28                     # account for the badge gutter
    put(dst, (x + 28, ry), truncate(ex["name"], "Montserrat", 700, 15.2, tw * 0.62),
        "Montserrat", 700, 15.2, TXT + (255,), tracking=0.1)
    put(dst, (x + tw, ry + 1), ex["scheme"], "Montserrat", 700, 14.4, acc + (255,), anchor="rt")

    ic = icon("clock", P(12), TXT3 + (235,))
    dst.alpha_composite(ic, (P(x + 28), P(ry + 26)))
    put(dst, (x + 28 + 15, ry + 26.5), "| " + ex["rest"], "Inter", 600, 10.6, TXT3 + (255,),
        tracking=0.3)

    lines = wrap(ex["cue"], "Inter", 400, 11.6, tw, maxlines=2)
    for j, ln in enumerate(lines):
        put(dst, (x + 28, ry + 46 + j * 14.4), ln, "Inter", 400, 11.6, TXT2 + (255,))

    cy = ry + 46 + len(lines) * 14.4 + 4
    cxp = x + 28
    for label, tone in ex["muscles"]:
        tone_c = ACCENTS[tone]
        cw = text_w(label, "Montserrat", 600, 8.6, 1.2) + 14
        if cxp + cw > x + tw:
            break
        round_rect(dst, (cxp, cy, cxp + cw, cy + 16), 4, fill=tone_c + (36,), outline=tone_c + (92,), width=1)
        put(dst, (cxp + cw / 2, cy + 8.5), label, "Montserrat", 600, 8.6, tone_c + (240,),
            tracking=1.2, anchor="cm")
        cxp += cw + 6


def draw_rest_card(dst, x, y, w, h, day):
    acc = ACCENTS["rest"]
    draw_card_header(dst, x, y, w, day, None)
    # decorative EKG strip for active recovery
    if day["icon"] == "pulse":
        by = y + h - 32
        pts = [(x + 26, by), (x + 26 + 82, by), (x + 26 + 104, by - 22),
               (x + 26 + 132, by + 22), (x + 26 + 156, by), (x + w - 26, by)]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            d2 = ImageDraw.Draw(dst)
            d2.line([P(ax), P(ay), P(bx), P(by)], fill=(0, 229, 255, 90), width=max(1, int(1.6 * gfx.S)))

    stat_v, stat_c = day["stat"]
    put(dst, (x + 26, y + 112), stat_v, "Teko", 700, 74, TXT + (255,), tracking=1.0)
    put(dst, (x + 26 + text_w(stat_v, "Teko", 700, 74, 1.0) + 14, y + 160), "RECOVERY", "Montserrat", 700,
        10.0, acc + (255,), tracking=2.4)
    put(dst, (x + 26, y + 196), truncate(stat_c, "Inter", 400, 11.6, w - 52), "Inter", 400, 11.6,
        TXT3 + (255,))

    yy = y + 252
    for ic_name, text in day["bullets"]:
        round_rect(dst, (x + 26, yy - 2, x + 48, yy + 20), 6, fill=(255, 255, 255, 14),
                   outline=(255, 255, 255, 36), width=1)
        ic = icon(ic_name, P(13), acc + (255,))
        dst.alpha_composite(ic, (P(x + 37) - ic.width // 2, P(yy + 9) - ic.height // 2))
        for j, ln in enumerate(wrap(text, "Inter", 500, 12.2, w - 26 - 48 - 12, maxlines=2)):
            put(dst, (x + 60, yy + j * 15.4), ln, "Inter", 500, 12.2, TXT2 + (255,))
        yy += 64


def draw_system_card(dst, x, y, w, h):
    acc = ACCENTS["gold"]
    day = {"day": SYSTEM["title"], "accent": "gold", "type": "12-WEEK PLAN",
           "focus": SYSTEM["sub"], "icon": "target"}
    draw_card_header(dst, x, y, w, day, None)

    # phase bars
    yy = y + 104
    for label, name, frac, desc in SYSTEM["phases"]:
        put(dst, (x + 26, yy + 2), label, "Montserrat", 700, 9.6, TXT3 + (255,), tracking=1.4)
        put(dst, (x + 26, yy + 15), name, "Montserrat", 700, 12.6, TXT + (255,), tracking=0.8)
        bw = w - 26 - 190
        round_rect(dst, (x + 190, yy + 12, x + 190 + bw, yy + 18), 3, fill=(255, 255, 255, 20))
        round_rect(dst, (x + 190, yy + 12, x + 190 + bw * frac, yy + 18), 3, fill=acc + (215,))
        put(dst, (x + 26, yy + 32), truncate(desc, "Inter", 400, 10.4, w - 52), "Inter", 400, 10.4,
            TXT3 + (255,))
        yy += 56

    # volume chart
    cy0, cy1 = yy + 14, yy + 14 + 92
    cx0, cx1 = x + 26, x + w - 26
    vols = SYSTEM["volume"]
    put(dst, (x + 26, cy0 - 12), "WEEKLY WORKING SETS", "Montserrat", 600, 8.4, TXT3 + (255,), tracking=1.6)
    n = len(vols)
    band = (cx1 - cx0) / n
    for k, (a, b, col) in enumerate([(0, 4, 0.035), (4, 8, 0.060), (8, 12, 0.085)]):
        round_rect(dst, (cx0 + k * band * 4, cy0, cx0 + (k + 1) * band * 4, cy1), 0,
                   fill=(255, 255, 255, int(col * 255)))
    # deload markers
    for wk in (7, 12):
        vline(dst, cx0 + band * (wk - 0.5), cy0 + 4, cy1, (255, 255, 255, 45), width=1)
    vmax = max(vols) * 1.18
    pts, dots = [], []
    for k, v in enumerate(vols):
        px = cx0 + band * (k + 0.5)
        py = cy1 - (v / vmax) * (cy1 - cy0)
        pts.append((P(px), P(py)))
        if k + 1 in (7, 12):
            dots.append(((P(px), P(py)), (255, 255, 255, 130), 2.9 * gfx.S))
        elif k in (0, len(vols) - 1):
            dots.append(((P(px), P(py)), acc + (255,), 3.1 * gfx.S))
    line, off = aa_polyline(pts, acc + (255,), width=2.0 * gfx.S, dots=dots)
    dst.alpha_composite(line, off)
    hline(dst, cx0, cx1, cy1, (255, 255, 255, 30))
    put(dst, (cx0, cy1 + 4), "W1", "Inter", 500, 8.4, TXT3 + (255,))
    put(dst, (cx0 + band * 4, cy1 + 4), "W4", "Inter", 500, 8.4, TXT3 + (255,))
    put(dst, (cx0 + band * 8, cy1 + 4), "W8", "Inter", 500, 8.4, TXT3 + (255,))
    put(dst, (cx1, cy1 + 4), "W12", "Inter", 500, 8.4, TXT3 + (255,), anchor="rt")
    # targets
    ty = cy1 + 30
    hline(dst, x + 26, x + w - 26, ty - 10, (255, 255, 255, 20))
    for i, (label, val) in enumerate(SYSTEM["targets"]):
        put(dst, (x + 26, ty + i * 24), label, "Montserrat", 700, 8.8, TXT3 + (255,), tracking=1.5)
        put(dst, (x + w - 26, ty + i * 24 - 1), val, "Montserrat", 600, 11.6, TXT + (255,), anchor="rt")
    put(dst, (x + 26, ty + 3 * 24 + 6), SYSTEM["deload"], "Inter", 400, 10.6, TXT3 + (255,))


_STRINGS: list = []


def _collect_strings():
    """Gather every string the layout renders, for glyph validation."""
    if _STRINGS:
        return
    def walk(o):
        if isinstance(o, str):
            _STRINGS.append(o)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v)
    for blob in (DAYS, LEGEND, META, PROFILE, SYSTEM, SHORT_TYPE, DAY_SHORT):
        walk(blob)
    _STRINGS.extend(["PROJECT ", "HYBRID", "12-WEEK PLAN"])


def draw_header(canvas):
    from PIL import ImageFilter
    x = PAD
    # eyebrow with dual accent ticks
    hline(canvas, x, x + 26, 62.5, ACCENTS["gold"] + (255,), width=2)
    hline(canvas, x + 30, x + 56, 62.5, ACCENTS["cyan"] + (255,), width=2)
    put(canvas, (x + 68, 56), META["eyebrow"], "Montserrat", 600, 12.0,
        ACCENTS["cyan"] + (255,), tracking=3.6)

    # title
    put(canvas, (x, 76), "PROJECT ", "Teko", 700, 124, TXT + (255,), tracking=0.5)
    wx = text_w("PROJECT ", "Teko", 700, 124, 0.5)
    put(canvas, (x + wx, 76), "HYBRID", "Teko", 700, 124, ACCENTS["cyan"] + (255,), tracking=0.5)

    put(canvas, (x + 3, 192), META["phase"], "Teko", 600, 62, (208, 218, 223, 255), tracking=8.0)
    put(canvas, (x, 276), META["kicker"], "Inter", 500, 12.2, TXT2 + (255,), tracking=2.4)

    # legend
    lx = x
    for tone, label in LEGEND:
        key = {"GOLD": "gold", "CYAN": "cyan", "MIX": "mix"}[tone]
        col = ACCENTS[key]
        d2 = ImageDraw.Draw(canvas)
        d2.ellipse([P(lx), P(321), P(lx + 9.5), P(330.5)], fill=col + (255,))
        if tone == "MIX":
            d2.ellipse([P(lx + 7.5), P(321), P(lx + 17), P(330.5)], fill=ACCENTS["cyan"] + (255,))
            lx += 17
        lx += 13
        put(canvas, (lx, 316), label, "Montserrat", 600, 8.8, TXT3 + (255,), tracking=1.6)
        lx += text_w(label, "Montserrat", 600, 8.8, 1.6) + 28

    # athlete profile panel
    px0, py0, px1, py1 = 1178, 44, 2130, 352
    layer = Image.new("RGBA", (P(px1 - px0), P(py1 - py0)), (0, 0, 0, 0))
    glow = aa_round_rect(P(px1 - px0), P(py1 - py0), 12 * gfx.S, fill=ACCENTS["gold"] + (34,), ss=3)
    glow = glow.filter(ImageFilter.GaussianBlur(P(10)))
    layer.alpha_composite(glow)
    panel = aa_round_rect(P(px1 - px0), P(py1 - py0), 12 * gfx.S, fill=(21, 22, 24, 240),
                          outline=ACCENTS["gold"] + (120,), width=max(1, int(1.2 * gfx.S)), ss=3)
    layer.alpha_composite(panel)
    canvas.alpha_composite(layer, (P(px0), P(py0)))

    put(canvas, (px0 + 24, py0 + 20), "ATHLETE PROFILE", "Montserrat", 700, 10.2,
        ACCENTS["gold"] + (255,), tracking=3.0)
    hline(canvas, px0 + 24, px1 - 24, py0 + 42, (255, 255, 255, 26))
    ry = py0 + 58
    for label, val in PROFILE:
        put(canvas, (px0 + 24, ry), label, "Montserrat", 700, 8.6, TXT3 + (255,), tracking=2.0)
        put(canvas, (px0 + 24, ry + 15), truncate(val, "Montserrat", 600, 13.2, px1 - px0 - 48),
            "Montserrat", 600, 13.2, TXT + (255,), tracking=0.1)
        ry += 58

    # hero anatomy plate
    hero = load_figure("hero.png", (0.52, 0.0, 1.0, 1.0), "hero_pair")
    paste_fit(canvas, hero, (2140, 12, 2520, 380), glow=ACCENTS["cyan"])

    draw_week_strip(canvas, PAD, 350, 1068, 42)


SHORT_TYPE = {"GYM": "GYM DAY", "CALISTHENICS": "CALISTHENICS", "ACTIVE RECOVERY": "RECOVERY",
              "REST": "REST", "HYBRID": "SKILL DAY"}
DAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]


def draw_week_strip(canvas, x, y, w, h):
    """At-a-glance 7-day split: doubles as the colour legend for the grid below."""
    gut = 6
    seg = (w - gut * 6) / 7
    for i, day in enumerate(DAYS):
        sx = x + i * (seg + gut)
        acc = accent_of(day)
        round_rect(canvas, (sx, y, sx + seg, y + h), 6, fill=(255, 255, 255, 9),
                   outline=(255, 255, 255, 20), width=1)
        # accent chip (two colours for the hybrid day)
        chip_x, chip_y, chip_w, chip_h = sx + 10, y + 9, 22, 3
        if day["accent"] == "mix":
            round_rect(canvas, (chip_x, chip_y, chip_x + chip_w, chip_y + chip_h), 1.5,
                       fill=ACCENTS["gold"] + (255,))
            round_rect(canvas, (chip_x + chip_w, chip_y, chip_x + chip_w * 2, chip_y + chip_h), 1.5,
                       fill=ACCENTS["cyan"] + (255,))
        else:
            round_rect(canvas, (chip_x, chip_y, chip_x + chip_w, chip_y + chip_h), 1.5,
                       fill=acc + (255,))
        put(canvas, (sx + 10, y + 19), day["day"][:3], "Montserrat", 700, 9.8, TXT + (255,),
            tracking=1.4)
        put(canvas, (sx + seg - 10, y + 21), SHORT_TYPE[day["type"]], "Montserrat", 600, 7.0,
            acc + (235,), tracking=1.1, anchor="rt")
        put(canvas, (sx + 10, y + 31), f"{len(day.get('exercises', [])) or '-'}", "Inter", 500, 7.6,
            (0, 0, 0, 0))


def build(scale=1.5):
    set_scale(scale)
    _collect_strings()
    validate_glyphs(_STRINGS)

    canvas = Image.new("RGBA", (P(BASE_W), P(BASE_H)), BG + (255,))
    draw_background(canvas)
    draw_header(canvas)

    CARD_W = (BASE_W - 2 * PAD - 3 * GUT) / 4
    COL_X = [PAD + i * (CARD_W + GUT) for i in range(4)]
    CARD_H = 466
    ROW_Y = [HEADER_Y + 18, HEADER_Y + 18 + CARD_H + GUT]

    slots = [(0, 0, DAYS[0]), (1, 0, DAYS[1]), (2, 0, DAYS[2]), (3, 0, DAYS[3]),
             (0, 1, DAYS[4]), (1, 1, DAYS[5]), (2, 1, DAYS[6]), (3, 1, None)]

    for col, row, day in slots:
        x, y = COL_X[col], ROW_Y[row]
        if day is None:
            layer, _ = card_panel(CARD_W, CARD_H, accent=ACCENTS["gold"])
            canvas.alpha_composite(layer, (P(x), P(y)))
            draw_system_card(canvas, x, y, CARD_W, CARD_H)
            continue

        acc = accent_of(day)
        layer, _ = card_panel(CARD_W, CARD_H, accent=acc)
        canvas.alpha_composite(layer, (P(x), P(y)))

        if day.get("exercises"):
            draw_card_header(canvas, x, y, CARD_W, day, None)
            fig_right = x + CARD_W - 26
            fig_left = fig_right - 158
            if day["figure"]:
                fig = load_figure(day["figure"], day["crop"], f"d{day['day'].lower()}")
                paste_fit(canvas, fig, (fig_left, y + 100, fig_right, y + 446), glow=acc)
            for i, ex in enumerate(day["exercises"]):
                draw_exercise(canvas, x + 26, y + 108 + i * 118, fig_left - 10 - (x + 26), i, ex, acc)
        else:
            draw_rest_card(canvas, x, y, CARD_W, CARD_H, day)

    # footer
    hline(canvas, PAD, BASE_W - PAD, FOOT_Y, (255, 255, 255, 22))
    put(canvas, (PAD, FOOT_Y + 12), META["footer_left"], "Montserrat", 600, 9.0, TXT3 + (255,),
        tracking=2.0)
    put(canvas, (BASE_W - PAD, FOOT_Y + 12), META["footer_right"], "Montserrat", 600, 9.0,
        TXT3 + (255,), tracking=2.0, anchor="rt")
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.5)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    canvas = build(args.scale)
    png = args.out or os.path.join(OUT_DIR, "project-hybrid-infographic.png")
    rgb = canvas.convert("RGB")
    rgb.save(png, optimize=True)
    dpi = 288
    rgb.save(os.path.join(OUT_DIR, "project-hybrid-infographic.pdf"), "PDF", resolution=dpi)
    print(f"PNG {rgb.size[0]}x{rgb.size[1]} -> {png} ({os.path.getsize(png)/1e6:.1f} MB)")
    print(f"PDF -> output/project-hybrid-infographic.pdf")


if __name__ == "__main__":
    main()
