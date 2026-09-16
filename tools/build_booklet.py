#!/usr/bin/env python3
"""
PROJECT HYBRID - Arabic printed booklet (A4 PDF).

  python3 tools/build_booklet.py            # A4 @ 300 dpi  -> output/*.pdf
  python3 tools/build_booklet.py --scale 1  # A4 @ 150 dpi preview

Content comes from plan_data.py (structure, sets, reps, rest, target muscles)
plus booklet_data.py (the Arabic wording). Every exercise and muscle must have
a translation or the build stops - so the booklet can never silently disagree
with the poster.
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx  # noqa: E402
from gfx import (CARD_BG, P, aa_round_rect, hline, load_figure,  # noqa: E402
                 paste_fit)
from rtl_text import RtlText, missing_glyphs  # noqa: E402
from plan_data import DAYS, META, SYSTEM  # noqa: E402
import booklet_data as B  # noqa: E402

ROOT = gfx.ROOT
OUT_DIR = os.path.join(ROOT, "output")
FONTS = gfx.FONTS

# ---- page + palette (light, print friendly) --------------------------------
PAGE_W, PAGE_H = 1240, 1754          # A4 @ 150 dpi
MARGIN = 66
DARK = (18, 18, 18)                  # cover / plaques (#121212)
PAPER = (255, 255, 255)
INK = (23, 25, 27)
INK2 = (86, 93, 98)
INK3 = (146, 152, 156)
RULE = (225, 229, 231)
GOLD = (170, 132, 0)                 # darkened for legibility on white
CYAN = (0, 148, 180)
REST_C = (122, 130, 136)
PAPER_TINT = (247, 248, 249)

ACCENT = {"gold": GOLD, "cyan": CYAN, "rest": REST_C, "mix": GOLD}

AR = os.path.join(FONTS, "IBMPlexSansArabic-{w}.ttf")
LAT = os.path.join(FONTS, "Inter-{w}.ttf")
LAT_B = os.path.join(FONTS, "Montserrat-{w}.ttf")


class Bk:
    """Booklet renderer: page stack + text styles + layout helpers."""

    def __init__(self, scale: float):
        gfx.set_scale(scale)
        self.pages: list[Image.Image] = []
        self.scale = scale
        # text styles (base units; RtlText multiplies by the render scale)
        self.t_title = self.style("IBMPlexSansArabic-700", "Montserrat-700", 40)
        self.t_h1 = self.style("IBMPlexSansArabic-700", "Montserrat-700", 30)
        self.t_h2 = self.style("IBMPlexSansArabic-700", "Montserrat-700", 21)
        self.t_h3 = self.style("IBMPlexSansArabic-600", "Montserrat-600", 16.5)
        self.t_body = self.style("IBMPlexSansArabic-400", "Inter-400", 16)
        self.t_small = self.style("IBMPlexSansArabic-400", "Inter-400", 13.5)
        self.t_tiny = self.style("IBMPlexSansArabic-500", "Inter-500", 11.5)
        self.t_chip = self.style("IBMPlexSansArabic-600", "Montserrat-600", 12.5)

    def style(self, ar_file, lat_file, size):
        def path(name):
            return os.path.join(FONTS, name if name.endswith(".ttf") else name + ".ttf")
        return RtlText(path(ar_file), path(lat_file), size)

    # ---------------------------------------------------------------- pages
    def new_page(self, dark=False):
        return Image.new("RGBA", (P(PAGE_W), P(PAGE_H)), (DARK if dark else PAPER) + (255,))

    def push(self, page):
        self.pages.append(page)

    def header(self, page, day_key, accent, title, focus, chip=None):
        """RTL page header: accent bar on the right, Arabic day name beneath."""
        right = PAGE_W - MARGIN
        bar_w = 132
        gfx.round_rect(page, (right - bar_w, 58, right, 63), 2.5, fill=accent + (255,))
        self.t_h1.draw(page, right, 78, title, INK)
        if chip:
            cw = self.t_chip.width(chip) + 26
            gfx.round_rect(page, (right - cw, 84, right, 84 + 30), 6,
                           outline=accent + (255,), width=1.4)
            self.t_chip.draw_center(page, right - cw / 2, 89, chip, accent)
        self.t_small.draw(page, right, 126, focus, INK2)
        hline(page, MARGIN, right, 166, RULE + (255,), width=1.2)

    def footer(self, page, number, total, label):
        right = PAGE_W - MARGIN
        y = PAGE_H - 62
        hline(page, MARGIN, right, y - 16, RULE + (255,), width=1)
        self.t_tiny.draw(page, right, y, label, INK3)
        # page number stays Latin (LTR) so "3 / 10" reads correctly
        self.t_tiny.draw_ltr(page, MARGIN, y, f"{number} / {total}", INK3)

    # ---------------------------------------------------------------- pieces
    def chip_text(self, page, right_x, y, text, color):
        """RTL text chip; returns (left_x, width)."""
        w = self.t_chip.width(text) + 26
        gfx.round_rect(page, (right_x - w, y, right_x, y + 27), 5,
                       fill=_tint(color) + (255,), outline=color + (255,), width=1.2)
        self.t_chip.draw_center(page, right_x - w / 2, y + 5, text, color)
        return right_x - w, w

    def latin_chip(self, page, x, y, text, color, size=15, bold=True):
        """LTR value chip (sets x reps, rest seconds)."""
        fam = "Montserrat-700" if bold else "Inter-500"
        f = gfx.font(fam.split("-")[0], int(fam.split("-")[1]), size)
        w = f.getlength(text) / gfx.S + 24
        gfx.round_rect(page, (x, y, x + w, y + 29), 6, outline=color + (255,), width=1.4)
        d = ImageDraw.Draw(page)
        d.text((P(x + 12), P(y + 6)), text, font=f, fill=color)
        return x + w

    def muscle_chips(self, page, right_x, y, labels, color):
        x = right_x
        for label in labels:
            w = self.t_chip.width(label) + 24
            if x - w < MARGIN:
                break
            gfx.round_rect(page, (x - w, y, x, y + 26), 5, fill=_tint(color) + (255,),
                           outline=color + (200,), width=1.1)
            self.t_chip.draw_center(page, x - w / 2, y + 4.5, label, color)
            x -= w + 7
        return y + 26

    def plaque(self, page, box, fig, accent):
        """Dark rounded panel holding an anatomy plate (art is lit for dark)."""
        x0, y0, x1, y1 = box
        layer = aa_round_rect(P(x1 - x0), P(y1 - y0), 12 * gfx.S,
                              fill=CARD_BG + (255,), ss=3)
        page.alpha_composite(layer, (P(x0), P(y0)))
        paste_fit(page, fig, (x0 + 6, y0 + 6, x1 - 6, y1 - 6), glow=accent)
        ring = aa_round_rect(P(x1 - x0), P(y1 - y0), 12 * gfx.S,
                             outline=accent + (110,), width=max(1, int(1.2 * gfx.S)), ss=3)
        page.alpha_composite(ring, (P(x0), P(y0)))

    def labelled(self, page, right_x, y, label, body, color, max_w, style=None,
                 label_color=None):
        """Small accent label above a wrapped Arabic paragraph."""
        self.t_tiny.draw(page, right_x, y, label, (label_color or color))
        y += self.t_tiny.line_height() * 0.95
        st = style or self.t_body
        return st.draw_wrapped(page, right_x, y, body, INK2, max_w, max_lines=3)

    # ---------------------------------------------------------------- cover
    def cover(self):
        page = self.new_page(dark=True)
        right = PAGE_W - MARGIN
        gfx.round_rect(page, (right - 190, 78, right, 84), 3, fill=GOLD + (255,))
        gfx.round_rect(page, (right - 120, 78, right, 84), 3, fill=(0, 229, 255, 255))

        self.t_h2.draw(page, right, 106, "PROJECT HYBRID", (255, 255, 255))
        self.t_title.draw(page, right, 148, B.TITLE, (255, 255, 255))
        self.t_h3.draw(page, right, 232, B.SUBTITLE, (198, 208, 214))
        hline(page, MARGIN, right, 288, (255, 255, 255, 40), width=1.2)
        self.t_small.draw(page, right, 306, B.EDITION, (0, 229, 255))

        # profile block
        py = 380
        self.t_h2.draw(page, right, py, "ملف اللاعب", (255, 255, 255))
        hline(page, right - 150, right, py + 34, GOLD + (200,), width=1.6)
        py += 62
        for label, val in B.AR_PROFILE:
            self.t_tiny.draw(page, right, py, label, GOLD)
            py += self.t_tiny.line_height() * 0.9
            py = self.t_body.draw_wrapped(page, right, py, val, (226, 231, 234),
                                          right - MARGIN, max_lines=2) + 14

        # hero art
        hero = load_figure("hero.png", (0.52, 0.0, 1.0, 1.0), "hero_pair")
        paste_fit(page, hero, (MARGIN - 20, 372, 640, 900), glow=(0, 229, 255))

        # week strip
        y = 980
        rows = [(d, B.AR_DAY[d["day"]]) for d in DAYS]
        cell = (PAGE_W - 2 * MARGIN - 6 * 8) / 7
        for i, (d, ar) in enumerate(rows):
            x = MARGIN + i * (cell + 8)
            acc = ACCENT[d["accent"]]
            gfx.round_rect(page, (x, y, x + cell, y + 96), 8,
                           fill=(255, 255, 255, 12), outline=(255, 255, 255, 34), width=1.1)
            if d["accent"] == "mix":
                gfx.round_rect(page, (x + 12, y + 14, x + cell / 2, y + 18), 2, fill=GOLD + (255,))
                gfx.round_rect(page, (x + cell / 2, y + 14, x + cell - 12, y + 18), 2,
                               fill=(0, 229, 255, 255))
            else:
                gfx.round_rect(page, (x + 12, y + 14, x + cell - 12, y + 18), 2, fill=acc + (255,))
            self.t_chip.draw_center(page, x + cell / 2, y + 30, ar["name"], (255, 255, 255))
            self.t_tiny.draw_center(page, x + cell / 2, y + 56, ar["type"], acc)
            n = len(d.get("exercises", []))
            self.t_tiny.draw_center(page, x + cell / 2, y + 74,
                                    f"{n} تمارين" if n else "استشفاء", (150, 158, 164))

        # targets
        y = 1130
        self.t_h2.draw(page, right, y, "الأرقام المطلوبة", (255, 255, 255))
        hline(page, right - 150, right, y + 34, GOLD + (200,), width=1.6)
        y += 62
        for label, val in B.AR_TARGETS:
            self.t_tiny.draw(page, right, y, label, (150, 158, 164))
            self.t_body.draw(page, right - 150, y - 4, val, (232, 236, 239))
            y += 40

        note = ("الهدف: بناء كتلة عضلية صافية من 58 كجم إلى 65 كجم وأكثر، "
                "مع إتقان حركات وزن الجسم خطوة بخطوة.")
        self.t_small.draw_wrapped(page, right, 1400, note, (150, 158, 164),
                                  PAGE_W - 2 * MARGIN, max_lines=3)

        hline(page, MARGIN, right, PAGE_H - 96, (255, 255, 255, 40), width=1)
        self.t_tiny.draw(page, right, PAGE_H - 78, B.FOOTER, (140, 148, 154))
        self.t_tiny.draw_ltr(page, MARGIN, PAGE_H - 78, "1 / 10", (140, 148, 154))
        self.push(page)

    # ---------------------------------------------------------------- overview
    def overview(self, total):
        page = self.new_page()
        right = PAGE_W - MARGIN
        self.header(page, None, GOLD, "نظرة عامة على الأسبوع",
                    "كيف تتوزع الأيام الأربعة للتدريب وثلاثة أيام للاستشفاء", chip="الأسبوع")
        y = 206

        # weekly table, right-to-left columns
        cols = [("اليوم", 150), ("النوع", 150), ("الجلسة", 190), ("التمارين", 120),
                ("التركيز", 430)]
        x = right
        self.t_h3.draw(page, right, y, "", INK)
        for name, w in cols:
            self.t_tiny.draw(page, x, y + 4, name, INK3)
            x -= w
        y += 26
        hline(page, MARGIN, right, y, RULE + (255,), width=1.2)
        y += 12
        for d in DAYS:
            ar = B.AR_DAY[d["day"]]
            acc = ACCENT[d["accent"]]
            h = 46
            if d["day"] in ("TUESDAY", "FRIDAY"):
                gfx.round_rect(page, (MARGIN, y - 6, right, y + h - 10), 6,
                               fill=(246, 247, 248, 255))
            gfx.round_rect(page, (right - 4, y, right, y + 26), 2, fill=acc + (255,))
            x = right - 14
            self.t_h3.draw(page, x, y, ar["name"], INK)
            x -= cols[0][1]
            self.t_chip.draw(page, x, y + 2, ar["type"], acc)
            x -= cols[1][1]
            self.t_body.draw(page, x, y, ar["title"], INK)
            x -= cols[2][1]
            n = len(d.get("exercises", []))
            self.t_body.draw(page, x, y, f"{n} × 3" if n else "—", INK2)
            x -= cols[3][1]                                    # right edge of the focus column
            focus = _clip(self.t_small, ar["focus"], cols[4][1] - 12)
            self.t_small.draw(page, x, y + 2, focus, INK2)
            y += h
            hline(page, MARGIN, right, y - 8, RULE + (255,), width=1)

        # 12-week system
        y += 26
        self.t_h2.draw(page, right, y, B.SYSTEM_TITLE, INK)
        hline(page, right - 170, right, y + 32, GOLD + (255,), width=1.6)
        y += 58
        for label, name, desc in B.AR_PHASES:
            self.t_h3.draw(page, right, y, f"{name}  ·  {label}", INK)
            y = self.t_small.draw_wrapped(page, right, y + 28, desc, INK2,
                                          right - MARGIN - 120, max_lines=2) + 16
        self.t_small.draw_wrapped(page, right, y + 4, B.AR_DELOAD, GOLD,
                                  right - MARGIN, max_lines=2)

        # targets strip
        y += 74
        gfx.round_rect(page, (MARGIN, y, right, y + 96), 10, fill=PAPER_TINT + (255,),
                       outline=RULE + (255,), width=1.2)
        x = right - 26
        for i, (label, val) in enumerate(B.AR_TARGETS):
            self.t_tiny.draw(page, x, y + 20, label, INK3)
            self.t_body.draw(page, x, y + 44, val, INK)
            x -= (right - MARGIN - 52) / 3
        self.t_small.draw(page, right, y + 118, B.AR_CHECK[0].split("—")[0].strip(), INK2)

        self.footer(page, 2, total, B.FOOTER)
        self.push(page)

    # ---------------------------------------------------------------- day page
    def day_page(self, day, number, total):
        page = self.new_page()
        ar = B.AR_DAY[day["day"]]
        acc = ACCENT[day["accent"]]
        self.header(page, day["day"], acc, f"{ar['name']} — {ar['type']}: {ar['title']}",
                    ar["focus"], chip=ar["type"])

        top, bottom = 200, PAGE_H - 110
        fig = load_figure(day["figure"], day["crop"], f"d{day['day'].lower()}")
        plaque_box = (MARGIN, top, MARGIN + 300, top + 430)
        self.plaque(page, plaque_box, fig, acc)

        text_right = PAGE_W - MARGIN
        text_left = plaque_box[2] + 34
        max_w = text_right - text_left

        # measure, then distribute the leftover space between exercise blocks
        heights = [self._ex_height(ex, max_w) for ex in day["exercises"]]
        avail = bottom - top
        gap = max(22.0, min(84.0, (avail - sum(heights)) / max(1, len(heights))))

        y = top
        for i, ex in enumerate(day["exercises"]):
            self._draw_exercise(page, ex, i + 1, y, text_right, text_left, max_w, acc)
            y += heights[i] + gap
            if i < len(day["exercises"]) - 1:
                hline(page, text_left, text_right, y - gap / 2 - 6, RULE + (255,), width=1)

        self.footer(page, number, total, B.FOOTER)
        self.push(page)

    def _ex_height(self, ex, max_w):
        """Measured height of one exercise block (must mirror _draw_exercise)."""
        from rtl_text import wrap_rtl
        a = B.AR_EX[ex["name"]]
        h = 34 + 22                                     # name + rest line
        for label, text in (("البداية", a["start"]), ("النهاية", a["finish"]),
                            ("ملاحظة", a["cue"])):
            lines = wrap_rtl(text, self.t_body.ar, self.t_body.latin, max_w, 3) \
                if self._fits else []
            h += self.t_tiny.line_height() * 0.95 + len(lines) * self.t_body.line_height() + 8
        return h + 26 + 10                              # muscle chips + breathing room

    @property
    def _fits(self):
        return True

    def _draw_exercise(self, page, ex, idx, y, right_x, left_x, max_w, acc):
        a = B.AR_EX[ex["name"]]
        # index badge + name (right aligned), scheme chip on the left
        gfx.round_rect(page, (right_x - 30, y + 2, right_x, y + 32), 8,
                       fill=_tint(acc) + (255,), outline=acc + (255,), width=1.3)
        self.t_chip.draw_center(page, right_x - 15, y + 7, str(idx), acc)
        self.t_h2.draw(page, right_x - 44, y + 2, a["name"], INK)
        self.latin_chip(page, left_x, y + 4, ex["scheme"].replace("×", "x"), acc)
        y += 40

        # rest + muscles
        self.t_small.draw(page, right_x, y, f"راحة {_secs(ex['rest'])} ثانية بين المجموعات", INK2)
        y += self.t_small.line_height()
        muscles = [B.AR_MUSCLE[m] for m, _ in ex["muscles"]]
        y = self.muscle_chips(page, right_x, y + 4, muscles, acc) + 12

        for label, text in (("البداية", a["start"]), ("النهاية", a["finish"]),
                            ("ملاحظة", a["cue"])):
            y = self.labelled(page, right_x, y, label, text, acc, max_w) + 8
        return y

    # ---------------------------------------------------------------- rest page
    def rest_page(self, days, number, total):
        page = self.new_page()
        acc = REST_C
        self.header(page, None, acc, "الثلاثاء والجمعة — الراحة والاستشفاء",
                    "يومان بلا تدريب شاق: هنا تُبنى العضلة فعلاً", chip="استشفاء")
        y = 210
        for d in days:
            ar = B.AR_DAY[d["day"]]
            rest = B.AR_REST[d["day"]]
            gfx.round_rect(page, (MARGIN, y, PAGE_W - MARGIN, y + 448), 12,
                           fill=PAPER_TINT + (255,), outline=RULE + (255,), width=1.2)
            right = PAGE_W - MARGIN - 30
            self.t_h2.draw(page, right, y + 28, f"{ar['name']} — {ar['title']}", INK)
            self.t_small.draw(page, right, y + 66, ar["focus"], INK2)
            hline(page, right - 170, right, y + 98, acc + (255,), width=1.4)
            yy = y + 122
            for b in rest["bullets"]:
                gfx.round_rect(page, (right - 10, yy + 6, right - 4, yy + 12), 3,
                               fill=acc + (255,))
                yy = self.t_body.draw_wrapped(page, right - 26, yy, b, INK,
                                              right - MARGIN - 26, max_lines=2) + 10
            # big stat
            st = self.t_title
            st.draw(page, right, y + 300, rest["stat_v"], acc)
            self.t_small.draw(page, right - 110, y + 336, rest["stat_u"], INK2)
            self.t_body.draw_wrapped(page, right, y + 372, rest["stat_c"], INK2,
                                     right - MARGIN - 26, max_lines=2)
            y += 486
        self.footer(page, number, total, B.FOOTER)
        self.push(page)

    # ---------------------------------------------------------------- rules page
    def rules_page(self, number, total):
        page = self.new_page()
        self.header(page, None, GOLD, B.RULES_TITLE,
                    "سبع قواعد تجعل الفرق بين تدريب يبني عضلة وتدريب يهدر الوقت",
                    chip="التنفيذ")
        y = 210
        right = PAGE_W - MARGIN
        for i, (head, body) in enumerate(B.AR_RULES, 1):
            gfx.round_rect(page, (right - 28, y + 2, right, y + 30), 7,
                           fill=PAPER_TINT + (255,), outline=GOLD + (150,), width=1.2)
            self.t_chip.draw_center(page, right - 14, y + 6, str(i), GOLD)
            self.t_h3.draw(page, right - 42, y + 2, head, INK)
            y = self.t_body.draw_wrapped(page, right, y + 30, body, INK2,
                                         right - MARGIN - 20, max_lines=3) + 18

        y += 10
        hline(page, MARGIN, right, y, RULE + (255,), width=1.2)
        y += 24
        self.t_h2.draw(page, right, y, B.CHECK_TITLE, INK)
        hline(page, right - 150, right, y + 32, CYAN + (255,), width=1.6)
        y += 58
        for item in B.AR_CHECK:
            gfx.round_rect(page, (right - 12, y + 7, right - 5, y + 14), 3.5, fill=CYAN + (255,))
            y = self.t_body.draw_wrapped(page, right - 28, y, item, INK2,
                                         right - MARGIN - 28, max_lines=3) + 12
        self.footer(page, number, total, B.FOOTER)
        self.push(page)

    # ---------------------------------------------------------------- scaling page
    def scaling_page(self, number, total):
        page = self.new_page()
        self.header(page, None, CYAN, B.SCALE_TITLE,
                    "إذا كان تمرين ما صعباً في البداية، لا تتخطاه — خفّفه بهذه البدائل",
                    chip="بدائل")
        y = 210
        right = PAGE_W - MARGIN
        for head, body in B.AR_SCALE:
            self.t_h3.draw(page, right, y, head, INK)
            y = self.t_body.draw_wrapped(page, right, y + 28, body, INK2,
                                         right - MARGIN, max_lines=3) + 16
            hline(page, MARGIN, right, y - 6, RULE + (255,), width=1)

        y += 16
        gfx.round_rect(page, (MARGIN, y, right, y + 150), 12, fill=PAPER_TINT + (255,),
                       outline=RULE + (255,), width=1.2)
        self.t_h3.draw(page, right - 26, y + 24, "الخلاصة", GOLD)
        self.t_body.draw_wrapped(page, right - 26, y + 56, B.CLOSING, INK,
                                 right - MARGIN - 52, max_lines=3)

        y += 190
        self.t_small.draw_wrapped(page, right, y, B.DISCLAIMER, INK3,
                                  right - MARGIN, max_lines=3)
        self.footer(page, number, total, B.FOOTER)
        self.push(page)

    # ---------------------------------------------------------------- output
    def save(self, stem, page_pngs=False):
        os.makedirs(OUT_DIR, exist_ok=True)
        base = os.path.join(OUT_DIR, stem)
        if page_pngs:
            for i, pg in enumerate(self.pages, 1):
                pg.convert("RGB").save(f"{base}-p{i:02d}.png", optimize=True)
        rgb = [pg.convert("RGB") for pg in self.pages]
        dpi = int(round(150 * self.scale))
        pdf = f"{base}.pdf"
        rgb[0].save(pdf, save_all=True, append_images=rgb[1:], resolution=dpi)
        print(f"booklet -> {pdf}  ({len(rgb)} pages, {dpi} dpi, "
              f"{os.path.getsize(pdf)/1e6:.1f} MB)")
        return pdf


def _clip(style, text: str, max_w: float) -> str:
    """Truncate Arabic text to fit max_w, adding an ellipsis when clipped."""
    if style.width(text) <= max_w:
        return text
    words = text.split()
    while words and style.width(" ".join(words) + " …") > max_w:
        words.pop()
    return " ".join(words) + " …"


def _tint(color, amount=0.10):
    """Very light wash of an accent, for chip fills on white paper."""
    r, g, b = color
    return (int(255 - (255 - r) * amount), int(255 - (255 - g) * amount),
            int(255 - (255 - b) * amount))


def _secs(rest: str) -> str:
    """'90s rest' -> '90'"""
    digits = "".join(ch for ch in rest if ch.isdigit())
    return digits or rest


def validate():
    """Every programme entry needs Arabic text, and every glyph must exist."""
    missing = []
    for d in DAYS:
        if d["day"] not in B.AR_DAY:
            missing.append(f"day {d['day']}")
        for ex in d.get("exercises", []):
            if ex["name"] not in B.AR_EX:
                missing.append(f"exercise {ex['name']}")
            for label, _ in ex["muscles"]:
                if label not in B.AR_MUSCLE:
                    missing.append(f"muscle {label}")
    for k in B.AR_REST:
        if k not in {d["day"] for d in DAYS}:
            missing.append(f"rest day {k}")
    if missing:
        raise SystemExit("BOOKLET CONTENT MISSING:\n  " + "\n  ".join(sorted(set(missing))))

    strings = [B.TITLE, B.SUBTITLE, B.EDITION, B.FOOTER, B.SYSTEM_TITLE, B.AR_DELOAD,
               B.RULES_TITLE, B.SCALE_TITLE, B.CHECK_TITLE, B.CLOSING, B.DISCLAIMER]
    for d in DAYS:
        ar = B.AR_DAY[d["day"]]
        strings += [ar["name"], ar["type"], ar["title"], ar["focus"]]
        exercises = d.get("exercises", [])
        for ex in exercises:
            a = B.AR_EX[ex["name"]]
            strings += [a["name"], a["start"], a["finish"], a["cue"], ex["scheme"]]
            strings += [B.AR_MUSCLE[m] for m, _ in ex["muscles"]]
    for v in B.AR_REST.values():
        strings += v["bullets"] + [v["stat_v"], v["stat_u"], v["stat_c"]]
    strings += [x for ph in B.AR_PHASES for x in ph]
    strings += [x for t in B.AR_TARGETS for x in t]
    strings += [h for h, _ in B.AR_RULES] + [t for _, t in B.AR_RULES]
    strings += [h for h, _ in B.AR_SCALE] + [t for _, t in B.AR_SCALE]
    strings += B.AR_CHECK + [v for _, v in B.AR_PROFILE] + [k for k, _ in B.AR_PROFILE]

    bad = missing_glyphs(strings, AR.format(w=400), LAT.format(w=400))
    bad |= missing_glyphs(strings, AR.format(w=700), LAT_B.format(w=700))
    if bad:
        raise SystemExit("GLYPH ERROR in booklet text: "
                         + ", ".join(f"{v!r} U+{k:04X}" for k, v in bad.items()))


def build(scale: float):
    validate()
    bk = Bk(scale)
    total = 10
    bk.cover()
    bk.overview(total)
    # page order: cover, overview, sun, mon, tue+fri, wed, thu, sat, rules, scaling
    bk.day_page(DAYS[0], 3, total)
    bk.day_page(DAYS[1], 4, total)
    bk.rest_page([DAYS[2], DAYS[5]], 5, total)
    bk.day_page(DAYS[3], 6, total)
    bk.day_page(DAYS[4], 7, total)
    bk.day_page(DAYS[6], 8, total)
    bk.rules_page(9, total)
    bk.scaling_page(10, total)
    return bk


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=2.0,
                    help="2.0 = A4 @300dpi (print), 1.0 = A4 @150dpi (preview)")
    ap.add_argument("--pages", action="store_true",
                    help="also write per-page PNGs (proofing only)")
    args = ap.parse_args()
    bk = build(args.scale)
    bk.save("project-hybrid-booklet-ar", page_pngs=args.pages)


if __name__ == "__main__":
    main()
