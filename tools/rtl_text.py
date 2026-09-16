#!/usr/bin/env python3
"""
Minimal RTL / mixed-script text engine for Pillow.

Pillow has no complex-text shaping, and the @fontsource Arabic subsets contain
no Latin digits or punctuation, so a line like "3 × 8–10 — تمرين" needs two
fonts in one line. This module:

  1. shapes Arabic with arabic-reshaper (contextual joining + lam-alef ligatures)
  2. reorders with python-bidi (get_display) so the string is in visual order
  3. splits the visual string into runs, choosing the font that actually
     contains each glyph (coverage-based, not script-based - otherwise an em
     dash or a digit inside Arabic text renders as a .notdef box)
  4. lays the runs out left to right, right-aligned inside an RTL column

Spaces inherit the font of the neighbouring run so Arabic word spacing stays
consistent instead of being set by the Latin font.
"""

from __future__ import annotations

from fontTools.ttLib import TTFont
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

import gfx

AR_RANGES = ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF),
             (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))
SPACES = " \u00a0\u200f\u200e\u202a\u202b\u202c"

_FONT_CACHE: dict = {}
_CMAP_CACHE: dict = {}


def is_arabic(ch: str) -> bool:
    c = ord(ch)
    return any(lo <= c <= hi for lo, hi in AR_RANGES)


def load_font(path: str, size_px: int) -> ImageFont.FreeTypeFont:
    key = (path, size_px)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(path, size_px)
    return _FONT_CACHE[key]


def cmap_of(path: str) -> set:
    if path not in _CMAP_CACHE:
        _CMAP_CACHE[path] = set(TTFont(path).getBestCmap().keys())
    return _CMAP_CACHE[path]


def shape(text: str) -> str:
    """Logical Arabic -> visual-order presentation forms."""
    if not text:
        return ""
    return get_display(arabic_reshaper.reshape(text))


def split_runs(visual: str, font_ar, font_latin):
    """[(text, use_arabic_font)] - one run per contiguous font choice.

    A character goes to the Arabic font when it is an Arabic letter, or when
    only the Arabic font has it (Arabic punctuation like ، ؛ ؟). Everything the
    Latin font covers (digits, +, x, dashes) stays Latin. Spaces follow the
    previous run; a leading space follows the first resolved character.
    """
    ar_cmap, la_cmap = cmap_of(font_ar.path), cmap_of(font_latin.path)

    def choose(ch: str, prev: bool) -> bool:
        if ch in SPACES:
            return prev
        if is_arabic(ch):
            return True
        if ord(ch) in la_cmap:
            return False
        if ord(ch) in ar_cmap:
            return True
        return False

    seq: list[tuple[str, bool | None]] = []
    prev: bool | None = None
    for ch in visual:
        if ch in SPACES and prev is None:
            seq.append((ch, None))              # resolve once we know the script
            continue
        kind = choose(ch, prev if prev is not None else True)
        prev = kind
        seq.append((ch, kind))

    first = next((k for _, k in seq if k is not None), True)
    runs: list[list] = []
    for ch, kind in seq:
        kind = first if kind is None else kind
        if runs and runs[-1][1] == kind:
            runs[-1][0] += ch
        else:
            runs.append([ch, kind])
    return [(t, k) for t, k in runs]


def measure(visual: str, font_ar, font_latin, tracking: float = 0.0) -> float:
    total = 0.0
    for text, ar in split_runs(visual, font_ar, font_latin):
        f = font_ar if ar else font_latin
        total += f.getlength(text) + tracking * len(text)
    return total


def draw_runs(dst, x, y, visual, color, font_ar, font_latin, tracking: float = 0.0):
    """Draw a visual-order string starting at x (left edge). Returns end x."""
    d = ImageDraw.Draw(dst)
    cx = x
    for text, ar in split_runs(visual, font_ar, font_latin):
        f = font_ar if ar else font_latin
        if tracking:
            for ch in text:
                d.text((cx, y), ch, font=f, fill=color)
                cx += f.getlength(ch) + tracking
        else:
            d.text((cx, y), text, font=f, fill=color)
            cx += f.getlength(text)
    return cx


def wrap_rtl(text: str, font_ar, font_latin, max_w: float, max_lines: int = 3,
             tracking: float = 0.0):
    """Greedy word wrap. max_w is in BASE units; returns logical lines."""
    words = text.split()
    max_w = max_w * gfx.S
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if measure(shape(trial), font_ar, font_latin, tracking) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines


class RtlText:
    """Draws Arabic-first text into a Pillow image.

    All public coordinates and sizes are in BASE design units (the same space
    gfx uses); only the font objects and internal metrics are device pixels.
    That keeps booklet layout code in one coordinate system.
    """

    def __init__(self, font_ar_path: str, font_latin_path: str, size: float,
                 tracking: float = 0.0, line_gap: float = 1.34):
        self.ar_path = font_ar_path
        self.latin_path = font_latin_path
        self.size = size
        self.ar = load_font(font_ar_path, gfx.P(size))
        self.latin = load_font(font_latin_path, gfx.P(size))
        self.tracking = tracking
        self.line_gap = line_gap

    def width(self, text: str) -> float:
        """Rendered width in base units."""
        return measure(shape(text), self.ar, self.latin, self.tracking) / gfx.S

    def line_height(self) -> float:
        """Line box height in base units."""
        asc, desc = self.ar.getmetrics()
        return (asc + desc) * self.line_gap / gfx.S

    def draw(self, dst, right_x: float, y: float, text: str, color,
             align: str = "right"):
        """Draw one line; align 'right' => right_x is the right edge (base units)."""
        visual = shape(text)
        w = measure(visual, self.ar, self.latin, self.tracking)
        x = gfx.P(right_x) - w if align == "right" else gfx.P(right_x)
        draw_runs(dst, x, gfx.P(y), visual, color, self.ar, self.latin, self.tracking)
        return w / gfx.S

    def draw_center(self, dst, center_x: float, y: float, text: str, color):
        visual = shape(text)
        w = measure(visual, self.ar, self.latin, self.tracking)
        draw_runs(dst, gfx.P(center_x) - w / 2, gfx.P(y), visual, color,
                  self.ar, self.latin, self.tracking)
        return w / gfx.S

    def draw_wrapped(self, dst, right_x: float, y: float, text: str, color,
                     max_w: float, max_lines: int = 3):
        """Draw a wrapped paragraph. Returns y after the last line (base units)."""
        lines = wrap_rtl(text, self.ar, self.latin, max_w, max_lines, self.tracking)
        lh = self.line_height()
        for i, ln in enumerate(lines):
            self.draw(dst, right_x, y + i * lh, ln, color)
        return y + len(lines) * lh

    def draw_ltr(self, dst, x: float, y: float, text: str, color):
        """Draw Latin/number text left-aligned (values, tags, page numbers)."""
        ImageDraw.Draw(dst).text((gfx.P(x), gfx.P(y)), text, font=self.latin, fill=color)
        return self.latin.getlength(text) / gfx.S


def missing_glyphs(strings, ar_path: str, latin_path: str):
    """Code points that neither font can draw, after shaping (per-run correct)."""
    ar_cmap, la_cmap = cmap_of(ar_path), cmap_of(latin_path)
    bad: dict[int, str] = {}
    for s in strings:
        if not isinstance(s, str):
            continue
        for ch in shape(s):
            if ch in "\n\r\t":
                continue
            cp = ord(ch)
            if cp not in ar_cmap and cp not in la_cmap:
                bad[cp] = ch
    return bad
