# PROJECT HYBRID — Zero to Advanced

**The gym & calisthenics blueprint for hypertrophy & skill.**

A complete 7-day training blueprint for a 173 cm / 58 kg total beginner, rendered as a
print-ready 16:9 infographic plus a companion exercise manual — both generated from a
single content model, so they can never drift apart.

---

## Deliverables (`output/`)

| File | What it is |
|---|---|
| `project-hybrid-infographic.png` | 3840 × 2160 (16:9, 4K) poster — matte black, electric blue / metallic gold anatomy highlights |
| `project-hybrid-infographic.pdf` | Same artwork as vector-preserving PDF for print |
| `project-hybrid-manual.md` | Exercise manual: prescriptions, start/finish positions, cues, scaling guide, recovery checklist |

**Design system:** background `#121212` · accents `#00E5FF` (calisthenics) and `#FFD700` (gym)
· type in Teko (display), Montserrat (headers/UI), Inter (body) · hairline borders, no drop
shadows.

---

## The plan at a glance

| Day | Type | Session | Volume |
|---|---|---|---|
| Sunday | Gym | Upper body | 3 × 3 sets |
| Monday | Calisthenics | Fundamentals | 3 × 3 sets |
| Tuesday | Recovery | Active recovery | — |
| Wednesday | Gym | Lower body | 3 × 3 sets |
| Thursday | Calisthenics | Pull + core | 3 × 3 sets |
| Friday | Rest | Tissue repair | — |
| Saturday | Hybrid | Skills + mobility | 3 × 3–4 sets |

12-week block: **W1–4** foundation → **W5–8** overload → **W9–12** skill integration,
with planned deloads in weeks 7 and 12.

---

## Rebuilding

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./tools/build_all.sh            # 4K poster (default)
./tools/build_all.sh --quick    # 2560 × 1440 quick preview
```

Requires Python 3 with `pillow`, `numpy` and `fontTools`. All fonts are **vendored**
in `assets/fonts` (converted from the OFL-licensed Montserrat / Inter / Teko web fonts),
so the build works fully offline.

### Repository layout

```
assets/
  fonts/        TTF display + UI + body families (OFL)
  raw/          generated anatomy plates - the figure source art
  processed/    cropped + background-keyed plates (build cache, gitignored)
tools/
  plan_data.py          single source of truth for all programme content
  build_infographic.py  16:9 renderer (pure Pillow: cards, icons, charts, type)
  build_manual.py       markdown manual generator
  build_all.sh          one-command rebuild
output/         final deliverables
```

### Editing the programme

Every number, cue and muscle target lives in `tools/plan_data.py`. Change it there and
re-run `./tools/build_all.sh` — the poster and the manual both pick the change up.
The renderer validates that every glyph used exists in the vendored fonts and fails
loudly instead of silently emitting `.notdef` boxes.

---

## Credits & licensing

- Programme design: PROJECT HYBRID (Phase 1 blueprint).
- Fonts: [Montserrat](https://fonts.google.com/specimen/Montserrat),
  [Inter](https://fonts.google.com/specimen/Inter),
  [Teko](https://fonts.google.com/specimen/Teko) — SIL Open Font License 1.1.
- Anatomy plates in `assets/raw/` are AI-generated illustrations, not medical references.
  They indicate *training emphasis*, not exhaustive anatomical activation.

> Not medical advice. Clear a new training programme with a physician, and stop if
> anything hurts in a way that isn't ordinary muscle fatigue.
