#!/usr/bin/env python3
"""
Shared drawing primitives (pure Pillow, no SVG/canvas backend).

Everything the poster and the printed booklet have in common lives here:
antialiased rounded rectangles and hairlines, gradients and alpha feathers,
vector icons, and a letter-spacing aware text layer.

All geometry is authored in "base" units and multiplied by a module-level
scale factor, so one layout definition renders at any resolution:

    gfx.set_scale(1.5)        # 1.5x, e.g. 2560x1440 base -> 3840x2160
    gfx.round_rect(canvas, (10, 10, 100, 40), 6, fill=(255, 0, 0, 255))
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
FONTS = os.path.join(ASSETS, "fonts")
RAW = os.path.join(ASSETS, "raw")
PROCESSED = os.path.join(ASSETS, "processed")

S = 1.5  # global render scale


def set_scale(scale: float):
    """Set the render scale and clear every cached size-dependent object."""
    global S
    S = scale
    _FONT_CACHE.clear()
    _TEXT_CACHE.clear()


def P(v):
    """base units -> device pixels"""
    return int(round(v * S))


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------
_FONT_CACHE: dict = {}


def font(fam: str, weight: int, size: int) -> ImageFont.FreeTypeFont:
    size = max(6, P(size))
    key = (fam, weight, size)
    if key not in _FONT_CACHE:
        path = os.path.join(FONTS, f"{fam}-{weight}.ttf")
        _FONT_CACHE[key] = ImageFont.truetype(path, size)
    return _FONT_CACHE[key]


# --------------------------------------------------------------------------
# glyph validation - fail loudly instead of rendering .notdef boxes
# --------------------------------------------------------------------------
def validate_glyphs(strings, family_weights=None, extra_cmaps=None):
    """Raise if any character has no glyph in the fonts asked to draw it.

    family_weights: {(family, weight), ...} - defaults to the Latin families.
    extra_cmaps:    {label: cmap_set} additional font coverage to accept
                    (used by the Arabic booklet's mixed-font line renderer).
    """
    from fontTools.ttLib import TTFont
    if family_weights is None:
        family_weights = {("Montserrat", 400), ("Montserrat", 500), ("Montserrat", 600),
                          ("Montserrat", 700), ("Montserrat", 800), ("Inter", 400),
                          ("Inter", 500), ("Inter", 600), ("Teko", 600), ("Teko", 700)}
    cmaps = {}
    for fam, weight in family_weights:
        path = os.path.join(FONTS, f"{fam}-{weight}.ttf")
        cmaps[(fam, weight)] = set(TTFont(path).getBestCmap().keys())
    chars = {c for s in strings if isinstance(s, str) for c in s}
    problems = []
    for key, cmap in cmaps.items():
        miss = sorted(c for c in chars if ord(c) not in cmap and c.strip())
        if miss:
            problems.append(f"{key[0]}-{key[1]} missing {''.join(miss)}")
    if problems:
        raise SystemExit("GLYPH ERROR:\n  " + "\n  ".join(problems))


# --------------------------------------------------------------------------
# text primitives
# --------------------------------------------------------------------------
_TEXT_CACHE: dict = {}


def _text_layer(s: str, fam: str, weight: int, size: float, color, tracking: float = 0.0):
    """Render a single line, tightly cropped, with letter-spacing."""
    key = (s, fam, weight, round(size, 2), color, round(tracking, 2))
    if key in _TEXT_CACHE:
        return _TEXT_CACHE[key]
    f = font(fam, weight, size)
    tk = tracking * S
    pad = P(6)
    widths = [f.getlength(ch) for ch in s]
    adv = sum(widths) + tk * max(0, len(s) - 1)
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (int(adv) + 2 * pad + 4, asc + desc + 2 * pad + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = pad
    for ch, w in zip(s, widths):
        d.text((x, pad), ch, font=f, fill=color)
        x += w + tk
    bb = img.getbbox()
    out = img.crop(bb) if bb else img
    _TEXT_CACHE[key] = out
    return out


ANCHORS = {
    "lt": (0.0, 0.0), "lm": (0.0, 0.5), "lb": (0.0, 1.0),
    "ct": (0.5, 0.0), "cm": (0.5, 0.5), "cb": (0.5, 1.0),
    "rt": (1.0, 0.0), "rm": (1.0, 0.5), "rb": (1.0, 1.0),
}


def put(dst, xy, s, fam, weight, size, color, tracking=0.0, anchor="lt"):
    """Paste a text line by its visual bounding box. xy in base units."""
    if not s:
        return 0
    layer = _text_layer(s, fam, weight, size, color, tracking)
    ax, ay = ANCHORS[anchor]
    x = P(xy[0]) - layer.width * ax
    y = P(xy[1]) - layer.height * ay
    dst.alpha_composite(layer, (int(round(x)), int(round(y))))
    return layer.width / S


def text_w(s, fam, weight, size, tracking=0.0):
    if not s:
        return 0.0
    return _text_layer(s, fam, weight, size, WHITE, tracking).width / S


def truncate(s, fam, weight, size, maxw, tracking=0.0):
    if text_w(s, fam, weight, size, tracking) <= maxw:
        return s
    ell = "\u2026"
    lo, hi = 0, len(s)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if text_w(s[:mid].rstrip() + ell, fam, weight, size, tracking) <= maxw:
            lo = mid
        else:
            hi = mid - 1
    return s[:lo].rstrip() + ell


def wrap(s, fam, weight, size, maxw, tracking=0.0, maxlines=2):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(trial, fam, weight, size, tracking) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
            if len(lines) == maxlines:
                break
    if cur and (len(lines) < maxlines or not lines):
        lines.append(cur)
    lines = lines[:maxlines]
    if len(lines) == maxlines:
        lines[-1] = truncate(lines[-1], fam, weight, size, maxw, tracking)
    return lines


WHITE = (255, 255, 255)

# dark "card" palette shared by the poster and the booklet cover
CARD_TOP = (25, 27, 29)
CARD_BG = (22, 24, 26)
CARD_BOT = (19, 20, 22)

# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------
_FONT_CACHE: dict = {}


def font(fam: str, weight: int, size: int) -> ImageFont.FreeTypeFont:
    size = max(6, P(size))
    key = (fam, weight, size)
    if key not in _FONT_CACHE:
        path = os.path.join(FONTS, f"{fam}-{weight}.ttf")
        _FONT_CACHE[key] = ImageFont.truetype(path, size)
    return _FONT_CACHE[key]


def famkey(fam, weight):
    return (fam, weight)


# --------------------------------------------------------------------------
# glyph validation - fail loudly instead of rendering .notdef boxes
# --------------------------------------------------------------------------
_GLYPH_OK: dict = {}


def validate_glyphs(strings):
    from fontTools.ttLib import TTFont
    families = {}
    for fam, weight in {("Montserrat", 400), ("Montserrat", 500), ("Montserrat", 600),
                        ("Montserrat", 700), ("Montserrat", 800), ("Inter", 400),
                        ("Inter", 500), ("Inter", 600), ("Teko", 600), ("Teko", 700)}:
        ft = TTFont(os.path.join(FONTS, f"{fam}-{weight}.ttf"))
        families[(fam, weight)] = set(ft.getBestCmap().keys())
    chars = {c for s in strings if isinstance(s, str) for c in s}
    problems = []
    for key, cmap in families.items():
        miss = sorted(c for c in chars if ord(c) not in cmap and c.strip())
        if miss:
            problems.append(f"{key[0]}-{key[1]} missing {''.join(miss)}")
    if problems:
        raise SystemExit("GLYPH ERROR:\n  " + "\n  ".join(problems))


# --------------------------------------------------------------------------
# glyph validation - fail loudly instead of rendering .notdef boxes
# --------------------------------------------------------------------------
def validate_glyphs(strings, family_weights=None, extra_cmaps=None):
    """Raise if any character has no glyph in the fonts asked to draw it.

    family_weights: {(family, weight), ...} - defaults to the Latin families.
    extra_cmaps:    {label: cmap_set} additional font coverage to accept
                    (used by the Arabic booklet's mixed-font line renderer).
    """
    from fontTools.ttLib import TTFont
    if family_weights is None:
        family_weights = {("Montserrat", 400), ("Montserrat", 500), ("Montserrat", 600),
                          ("Montserrat", 700), ("Montserrat", 800), ("Inter", 400),
                          ("Inter", 500), ("Inter", 600), ("Teko", 600), ("Teko", 700)}
    cmaps = {}
    for fam, weight in family_weights:
        path = os.path.join(FONTS, f"{fam}-{weight}.ttf")
        cmaps[(fam, weight)] = set(TTFont(path).getBestCmap().keys())
    chars = {c for s in strings if isinstance(s, str) for c in s}
    problems = []
    for key, cmap in cmaps.items():
        miss = sorted(c for c in chars if ord(c) not in cmap and c.strip())
        if miss:
            problems.append(f"{key[0]}-{key[1]} missing {''.join(miss)}")
    if problems:
        raise SystemExit("GLYPH ERROR:\n  " + "\n  ".join(problems))


# --------------------------------------------------------------------------
# text primitives
# --------------------------------------------------------------------------
_TEXT_CACHE: dict = {}


def _text_layer(s: str, fam: str, weight: int, size: float, color, tracking: float = 0.0):
    """Render a single line, tightly cropped, with letter-spacing."""
    key = (s, fam, weight, round(size, 2), color, round(tracking, 2))
    if key in _TEXT_CACHE:
        return _TEXT_CACHE[key]
    f = font(fam, weight, size)
    tk = tracking * S
    pad = P(6)
    widths = [f.getlength(ch) for ch in s]
    adv = sum(widths) + tk * max(0, len(s) - 1)
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (int(adv) + 2 * pad + 4, asc + desc + 2 * pad + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = pad
    for ch, w in zip(s, widths):
        d.text((x, pad), ch, font=f, fill=color)
        x += w + tk
    bb = img.getbbox()
    out = img.crop(bb) if bb else img
    _TEXT_CACHE[key] = out
    return out


ANCHORS = {
    "lt": (0.0, 0.0), "lm": (0.0, 0.5), "lb": (0.0, 1.0),
    "ct": (0.5, 0.0), "cm": (0.5, 0.5), "cb": (0.5, 1.0),
    "rt": (1.0, 0.0), "rm": (1.0, 0.5), "rb": (1.0, 1.0),
}


def put(dst, xy, s, fam, weight, size, color, tracking=0.0, anchor="lt"):
    """Paste a text line by its visual bounding box. xy in base units."""
    if not s:
        return 0
    layer = _text_layer(s, fam, weight, size, color, tracking)
    ax, ay = ANCHORS[anchor]
    x = P(xy[0]) - layer.width * ax
    y = P(xy[1]) - layer.height * ay
    dst.alpha_composite(layer, (int(round(x)), int(round(y))))
    return layer.width / S


def text_w(s, fam, weight, size, tracking=0.0):
    if not s:
        return 0.0
    return _text_layer(s, fam, weight, size, WHITE, tracking).width / S


def truncate(s, fam, weight, size, maxw, tracking=0.0):
    if text_w(s, fam, weight, size, tracking) <= maxw:
        return s
    ell = "…"
    lo, hi = 0, len(s)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if text_w(s[:mid].rstrip() + ell, fam, weight, size, tracking) <= maxw:
            lo = mid
        else:
            hi = mid - 1
    return s[:lo].rstrip() + ell


def wrap(s, fam, weight, size, maxw, tracking=0.0, maxlines=2):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(trial, fam, weight, size, tracking) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
            if len(lines) == maxlines:
                break
    if cur and (len(lines) < maxlines or not lines):
        lines.append(cur)
    lines = lines[:maxlines]
    if len(lines) == maxlines:
        lines[-1] = truncate(lines[-1], fam, weight, size, maxw, tracking)
    return lines


# --------------------------------------------------------------------------
# shape primitives (supersampled)
# --------------------------------------------------------------------------
def aa_round_rect(w, h, r, fill=None, outline=None, width=1, ss=4):
    w, h = max(1, int(round(w))), max(1, int(round(h)))
    big = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.rounded_rectangle(
        [0, 0, w * ss - 1, h * ss - 1], radius=max(1, int(r * ss)),
        fill=fill, outline=outline, width=max(1, int(round(width * ss))),
    )
    return big.resize((w, h), Image.LANCZOS)


def round_rect(dst, box, r, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = [P(v) for v in box]
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    layer = aa_round_rect(w, h, max(1, r * S), fill=fill, outline=outline,
                          width=max(1, round(width * S)))
    dst.alpha_composite(layer, (x0, y0))


def hline(dst, x0, x1, y, color, width=1):
    y = int(round(P(y)))
    img = Image.new("RGBA", (max(1, P(x1) - P(x0)), max(1, int(round(width * S)))), color)
    dst.alpha_composite(img, (P(x0), y))


def vline(dst, x, y0, y1, color, width=1):
    x = int(round(P(x)))
    img = Image.new("RGBA", (max(1, int(round(width * S))), max(1, P(y1) - P(y0))), color)
    dst.alpha_composite(img, (x, P(y0)))


def aa_polyline(pts, color, width=1.0, dots=None, ss=4):
    """Antialiased polyline in device px with optional dot markers."""
    if not pts:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    pad = int(width * ss) + 4
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs) - pad, min(ys) - pad
    w = int(max(xs) - x0 + pad)
    h = int(max(ys) - y0 + pad)
    big = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.line([((p[0] - x0) * ss, (p[1] - y0) * ss) for p in pts], fill=color,
           width=max(1, int(round(width * ss))), joint="curve")
    if dots:
        for (dx, dy), dcol, dr in dots:
            d.ellipse([(dx - x0 - dr) * ss, (dy - y0 - dr) * ss,
                       (dx - x0 + dr) * ss, (dy - y0 + dr) * ss], fill=dcol)
    return big.resize((w, h), Image.LANCZOS), (x0, y0)


def gradient_h(w, h, stops):
    """stops: list of (pos 0..1, rgba) -> horizontal gradient image"""
    w, h = max(1, int(w)), max(1, int(h))
    xs = np.arange(w, dtype=np.float32) / max(1, w - 1)
    out = np.zeros((h, w, 4), np.float32)
    for ch in range(4):
        vals = np.interp(xs, [s[0] for s in stops], [s[1][ch] for s in stops])
        out[:, :, ch] = vals
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def gradient_v(w, h, stops):
    w, h = max(1, int(w)), max(1, int(h))
    ys = np.arange(h, dtype=np.float32) / max(1, h - 1)
    out = np.zeros((h, w, 4), np.float32)
    for ch in range(4):
        vals = np.interp(ys, [s[0] for s in stops], [s[1][ch] for s in stops])
        out[:, :, ch] = vals[:, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def alpha_ramp(w, h, left=None, right=None, top=None, bottom=None):
    """Multiplicative alpha ramp mask (numpy float array) for feathering."""
    ax = np.ones((1, max(1, int(w))), np.float32)
    ay = np.ones((max(1, int(h)), 1), np.float32)
    for side, frac in (("l", left), ("r", right)):
        if frac:
            n = max(1, int(w * frac))
            ramp = np.linspace(0.0, 1.0, n, dtype=np.float32) ** 1.4
            if side == "l":
                ax[0, :n] *= ramp
            else:
                ax[0, -n:] *= ramp[::-1]
    for side, frac in (("t", top), ("b", bottom)):
        if frac:
            n = max(1, int(h * frac))
            ramp = np.linspace(0.0, 1.0, n, dtype=np.float32) ** 1.4
            if side == "t":
                ay[:n, 0] *= ramp
            else:
                ay[-n:, 0] *= ramp[::-1]
    return ax * ay


def card_panel(w, h, r=14, accent=None):
    """Rounded card with a subtle vertical gradient and hairline edge."""
    W, H = P(w), P(h)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = gradient_v(W, H, [(0.0, CARD_TOP + (255,)), (0.55, CARD_BG + (255,)), (1.0, CARD_BOT + (255,))])
    mask = aa_round_rect(W, H, r * S, fill=(255, 255, 255, 255), ss=3)
    layer.alpha_composite(Image.composite(grad, Image.new("RGBA", (W, H), (0, 0, 0, 0)), mask.split()[3]))
    d = ImageDraw.Draw(layer)
    edge = aa_round_rect(W, H, r * S, outline=(255, 255, 255, 26), width=max(1, int(round(1.0 * S))), ss=3)
    layer.alpha_composite(edge)
    if accent is not None:
        # accent hairline along the top edge, fading out to the right
        line_h = max(1, int(round(2 * S)))
        seg = max(1, int(W * 0.62))
        g = gradient_h(seg, line_h, [(0.0, accent + (225,)), (0.55, accent + (110,)), (1.0, accent + (0,))])
        layer.alpha_composite(g, (int(r * S * 0.6), 0))
        d.line([(int(r * S * 0.6), line_h), (int(r * S * 0.6) + seg, line_h)], fill=None)
    return layer, d


# --------------------------------------------------------------------------
# icons (drawn at 4x, downsampled)
# --------------------------------------------------------------------------
def _icon_canvas(size):
    ss = 4
    n = max(2, int(round(size * ss)))
    return Image.new("RGBA", (n, n), (0, 0, 0, 0)), ss, n


def _fin(img, size):
    return img.resize((max(1, int(round(size))), max(1, int(round(size)))), Image.LANCZOS)


def icon(name, size, color):
    """Vector icon, returns RGBA of ~size x size (device px)."""
    img, ss, n = _icon_canvas(size)
    d = ImageDraw.Draw(img)
    c = color
    lw = max(2, int(n * 0.085))
    if name == "dumbbell":
        d.rounded_rectangle([n * .10, n * .41, n * .21, n * .59], radius=n * .04, fill=c)
        d.rounded_rectangle([n * .79, n * .41, n * .90, n * .59], radius=n * .04, fill=c)
        d.rounded_rectangle([n * .19, n * .30, n * .30, n * .70], radius=n * .05, fill=c)
        d.rounded_rectangle([n * .70, n * .30, n * .81, n * .70], radius=n * .05, fill=c)
        d.rectangle([n * .30, n * .455, n * .70, n * .545], fill=c)
    elif name == "barbell":
        d.rounded_rectangle([n * .04, n * .46, n * .96, n * .54], radius=n * .04, fill=c)
        d.rounded_rectangle([n * .16, n * .28, n * .28, n * .72], radius=n * .04, fill=c)
        d.rounded_rectangle([n * .72, n * .28, n * .84, n * .72], radius=n * .04, fill=c)
        d.rounded_rectangle([n * .10, n * .38, n * .17, n * .62], radius=n * .03, fill=c)
        d.rounded_rectangle([n * .83, n * .38, n * .90, n * .62], radius=n * .03, fill=c)
    elif name == "bar":
        d.rounded_rectangle([n * .06, n * .20, n * .94, n * .29], radius=n * .04, fill=c)
        d.rectangle([n * .12, n * .20, n * .175, n * .92], fill=c)
        d.rectangle([n * .825, n * .20, n * .88, n * .92], fill=c)
        d.rounded_rectangle([n * .38, n * .29, n * .62, n * .44], radius=n * .07, fill=None, outline=c, width=lw)
    elif name == "figure":
        d.ellipse([n * .38, n * .06, n * .62, n * .30], fill=c)
        d.rounded_rectangle([n * .42, n * .33, n * .58, n * .60], radius=n * .07, fill=c)
        d.line([(n * .50, n * .58), (n * .34, n * .92)], fill=c, width=lw)
        d.line([(n * .50, n * .58), (n * .66, n * .92)], fill=c, width=lw)
        d.line([(n * .38, n * .42), (n * .16, n * .30)], fill=c, width=lw)
        d.line([(n * .62, n * .42), (n * .84, n * .30)], fill=c, width=lw)
    elif name == "pulse":
        pts = [(n * .04, n * .52), (n * .24, n * .52), (n * .34, n * .22), (n * .47, n * .84),
               (n * .58, n * .40), (n * .66, n * .52), (n * .96, n * .52)]
        d.line(pts, fill=c, width=lw, joint="curve")
    elif name == "moon":
        m = Image.new("L", (n, n), 0)
        dm = ImageDraw.Draw(m)
        dm.ellipse([n * .08, n * .06, n * .92, n * .90], fill=255)
        dm.ellipse([n * .34, n * -.06, n * 1.18, n * .78], fill=0)
        col = Image.new("RGBA", (n, n), c)
        img.alpha_composite(Image.composite(col, Image.new("RGBA", (n, n), (0, 0, 0, 0)), m))
        d = ImageDraw.Draw(img)
        for i, (cx, cy, r) in enumerate([(.74, .30, .055), (.86, .52, .045), (.70, .66, .035)]):
            d.ellipse([n * (cx - r), n * (cy - r), n * (cx + r), n * (cy + r)], fill=c)
    elif name == "bolt":
        d.polygon([(n * .56, n * .04), (n * .18, n * .56), (n * .45, n * .56), (n * .36, n * .96),
                   (n * .82, n * .40), (n * .52, n * .40)], fill=c)
    elif name == "walk":
        d.ellipse([n * .40, n * .05, n * .62, n * .27], fill=c)
        d.line([(n * .51, n * .30), (n * .46, n * .60)], fill=c, width=lw)
        d.line([(n * .46, n * .60), (n * .28, n * .95)], fill=c, width=lw)
        d.line([(n * .46, n * .60), (n * .72, n * .93)], fill=c, width=lw)
        d.line([(n * .50, n * .38), (n * .22, n * .50)], fill=c, width=lw)
        d.line([(n * .50, n * .38), (n * .78, n * .30)], fill=c, width=lw)
    elif name == "drop":
        d.polygon([(n * .5, n * .06), (n * .18, n * .58), (n * .82, n * .58)], fill=c)
        d.ellipse([n * .18, n * .40, n * .82, n * .94], fill=c)
    elif name == "plate":
        d.ellipse([n * .06, n * .06, n * .94, n * .94], outline=c, width=lw)
        d.ellipse([n * .32, n * .32, n * .68, n * .68], fill=c)
    elif name == "clock":
        d.ellipse([n * .06, n * .06, n * .94, n * .94], outline=c, width=lw)
        d.line([(n * .5, n * .27), (n * .5, n * .54)], fill=c, width=lw)
        d.line([(n * .5, n * .54), (n * .70, n * .66)], fill=c, width=lw)
    elif name == "target":
        d.ellipse([n * .05, n * .05, n * .95, n * .95], outline=c, width=lw)
        d.ellipse([n * .30, n * .30, n * .70, n * .70], outline=c, width=lw)
        d.ellipse([n * .44, n * .44, n * .56, n * .56], fill=c)
    elif name == "arrow_up":
        d.line([(n * .5, n * .90), (n * .5, n * .16)], fill=c, width=lw)
        d.polygon([(n * .5, n * .05), (n * .26, n * .34), (n * .74, n * .34)], fill=c)
    else:
        raise ValueError(f"unknown icon {name}")
    return _fin(img, size)


# --------------------------------------------------------------------------
# anatomy figure plates
# --------------------------------------------------------------------------
def ensure_processed():
    os.makedirs(PROCESSED, exist_ok=True)


def load_figure(fname: str, crop, key: str):
    """Crop + background-key a generated anatomy plate onto CARD_BG.

    Background-keying (rather than transparent cutout) is deliberate: the
    plates are photographic renders and a hard alpha edge would look cut out.
    The plate's dark studio background is remapped to the exact card colour,
    so it composites seamlessly on the dark cards and plaques.
    """
    ensure_processed()
    cache = os.path.join(PROCESSED, f"{key}.png")
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(os.path.join(RAW, fname)):
        return Image.open(cache).convert("RGBA")

    im = Image.open(os.path.join(RAW, fname)).convert("RGB")
    W0, H0 = im.size
    x0, y0, x1, y1 = crop
    im = im.crop((int(x0 * W0), int(y0 * H0), int(x1 * W0), int(y1 * H0)))
    a = np.asarray(im).astype(np.float32)

    lum = a.mean(2)
    T = 46.0
    crush = np.clip(1.0 - lum / T, 0.0, 1.0) ** 1.15
    crush = crush[..., None]

    boosted = np.clip(a * 1.16, 0, 255)
    bgarr = np.array(CARD_BG, np.float32).reshape(1, 1, 3)
    out = boosted * (1.0 - crush) + bgarr * crush

    # tighten to actual content
    m = out.mean(2) > (sum(CARD_BG) / 3.0 + 13.0)
    ys, xs = np.where(m)
    if len(xs):
        padx = int(0.015 * out.shape[1])
        pady = int(0.010 * out.shape[0])
        out = out[max(0, ys.min() - pady): ys.max() + pady, max(0, xs.min() - padx): xs.max() + padx]

    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    ramp = alpha_ramp(img.width, img.height, left=0.14, right=0.10, top=0.05, bottom=0.07)
    arr = np.asarray(img).astype(np.float32)
    arr[:, :, 3] *= ramp
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    img.save(cache)
    return img


def paste_fit(dst, fig, box, glow=None):
    """Fit a figure into a base-unit box (contain) and composite it."""
    bx0, by0, bx1, by1 = box
    bw, bh = P(bx1 - bx0), P(by1 - by0)
    r = min(bw / fig.width, bh / fig.height)
    w, h = max(1, int(fig.width * r)), max(1, int(fig.height * r))
    f = fig.resize((w, h), Image.LANCZOS)
    x = P(bx0) + (bw - w) // 2
    y = P(by0) + (bh - h) // 2
    if glow:
        # soft accent bloom behind the body
        lum = np.asarray(f.convert("L")).astype(np.float32)
        m = np.clip((lum - 92) / 130.0, 0, 1) ** 1.9
        bloom = Image.new("RGBA", (w, h), glow + (0,))
        ba = np.asarray(bloom).copy()
        ba[:, :, 3] = (m * 105).astype(np.uint8)
        bloom = Image.fromarray(ba, "RGBA")
        from PIL import ImageFilter
        bloom = bloom.filter(ImageFilter.GaussianBlur(P(11)))
        dst.alpha_composite(bloom, (x, y))
    dst.alpha_composite(f, (x, y))
