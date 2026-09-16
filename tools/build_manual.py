#!/usr/bin/env python3
"""
PROJECT HYBRID - exercise manual generator.
Emits a markdown manual from the same content model that drives the infographic,
so the poster and the document can never drift apart.

  python3 tools/build_manual.py     ->  output/project-hybrid-manual.md
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan_data import DAYS, LEGEND, META, PROFILE, SYSTEM  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "output")
ACCENT_ICON = {"gold": "🟡", "cyan": "🔵", "rest": "⚪", "mix": "🟡🔵"}
TOTAL_MOVES = sum(len(d.get("exercises", [])) for d in DAYS)


def md_table(rows, header):
    """Markdown table with pipe characters escaped so cells never break."""
    esc = lambda v: str(v).replace("|", "\\|")           # noqa: E731
    out = ["| " + " | ".join(esc(h) for h in header) + " |",
           "|" + "|".join(["---"] * len(header)) + "|"]
    out += ["| " + " | ".join(esc(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def build() -> str:
    L: list[str] = []
    L.append(f"# {META['program']}: {META['phase']}")
    L.append("")
    L.append(f"**{META['kicker']}**")
    L.append("")
    L.append(f"*{META['eyebrow']}*")
    L.append("")
    L.append("---")
    L.append("")

    # ---- profile
    L.append("## Athlete profile")
    L.append("")
    L.append(md_table([[k, v] for k, v in PROFILE], ["Field", "Detail"]))
    L.append("")
    L.append("## Colour key")
    L.append("")
    L.append(md_table([[a, b] for a, b in LEGEND], ["Legend", "Meaning"]))
    L.append("")
    L.append(f"**{TOTAL_MOVES} movements** across **4 training days**, "
             f"with **3 recovery days** built into the week.")
    L.append("")
    L.append("---")
    L.append("")

    # ---- weekly architecture
    L.append("## Weekly architecture")
    L.append("")
    rows = []
    for d in DAYS:
        n = len(d.get("exercises", []))
        rows.append([
            f"{ACCENT_ICON[d['accent']]} {d['day']}",
            d["type"],
            d["title"],
            f"{n} movements" if n else "—",
            d["focus"],
        ])
    L.append(md_table(rows, ["Day", "Type", "Session", "Volume", "Focus"]))
    L.append("")

    # ---- the system
    L.append(f"## {SYSTEM['title']} — how the 12 weeks progress")
    L.append("")
    L.append(md_table([[label, name, desc] for label, name, _frac, desc in SYSTEM["phases"]],
                      ["Weeks", "Phase", "Progression rule"]))
    L.append("")
    L.append(f"- **Weekly working sets:** {' → '.join(str(v) for v in SYSTEM['volume'])}")
    L.append(f"- **Planned deload:** {SYSTEM['deload']}")
    L.append("")
    L.append(md_table([[a, b] for a, b in SYSTEM["targets"]], ["Target", "Value"]))
    L.append("")
    L.append("---")
    L.append("")

    # ---- sessions
    L.append("## The sessions")
    L.append("")
    for d in DAYS:
        acc = ACCENT_ICON[d["accent"]]
        L.append(f"### {acc} {d['day']} — {d['type']}: {d['title']}")
        L.append("")
        L.append(f"*{d['focus']}*")
        L.append("")
        if d.get("exercises"):
            rows = [[str(i), e["name"], e["scheme"], e["rest"].replace(" rest", ""),
                     ", ".join(m for m, _ in e["muscles"])]
                    for i, e in enumerate(d["exercises"], 1)]
            L.append(md_table(rows, ["#", "Exercise", "Sets × Reps", "Rest", "Target muscles"]))
            L.append("")
            for i, e in enumerate(d["exercises"], 1):
                L.append(f"**{i}. {e['name']}** — {e['scheme']} · {e['rest']}")
                L.append("")
                L.append(f"- **Start:** {e['start']}")
                L.append(f"- **Finish:** {e['finish']}")
                L.append(f"- **Coaching cue:** {e['cue']}")
                L.append("- **Targets:** " + " · ".join(
                    f"{m} ({tone})" for m, tone in e["muscles"]))
                L.append("")
        else:
            for icon, text in d["bullets"]:
                L.append(f"- {text}")
            L.append("")
            L.append(f"> **{d['stat'][0]}** — {d['stat'][1]}")
            L.append("")
        L.append("")

    L.append("---")
    L.append("")
    L.append("## Rules of execution")
    L.append("")
    L.append("1. **Warm up first — always.** 5–8 minutes of easy movement, then 2 lighter "
             "sets of the first exercise before your working weight.")
    L.append("2. **Leave 2–3 reps in reserve** in weeks 1–4. Stop the set when the next rep "
             "would slow down or break form, not when you hit failure.")
    L.append("3. **Tempo:** 2 seconds down, 1 second up, no bouncing. Control is the training "
             "stimulus — the weight is just the tool.")
    L.append("4. **Rest periods are part of the prescription.** Use a timer. Short rest "
             "compromises the next set more than a light load does.")
    L.append("5. **Add reps before you add weight.** Hit the top of the rep range on all "
             "sets, then increase the load by the smallest available increment.")
    L.append("6. **Log every session.** Weight, reps, and how hard it felt. The log is what "
             "makes week 5 different from week 1.")
    L.append("7. **Never train through joint pain.** Muscle soreness is normal; sharp or "
             "localised joint pain means stop and regress the movement.")
    L.append("")
    L.append("## Scaling guide")
    L.append("")
    L.append(md_table([
        ["Push-ups too hard", "Knee push-ups or incline (hands on a bench). Regress until "
                              "you can own 3 × 8 clean reps, then progress."],
        ["Australian pull-ups too hard", "Raise the bar height so the torso is more upright, "
                                         "or bend the knees and plant the feet closer."],
        ["Negative pull-ups too hard", "Use a box to step to the top and lower over 3 seconds "
                                       "only — or substitute 3 × 5 slow Australian pull-ups."],
        ["Plank / hollow hold too hard", "Reduce the hold time before you reduce the quality. "
                                         "20 perfect seconds beats 45 sloppy ones."],
        ["Wall walks too hard", "Start with pike holds against a wall, then walk one step up "
                                "and back down under control."],
        ["No dumbbells available", "Any pressing/rowing implement works — machines, kettlebells, "
                                   "resistance bands. Keep the movement pattern and the "
                                   "rep/rest prescription."],
    ], ["Situation", "Regression / substitution"]))
    L.append("")
    L.append("## Recovery checklist")
    L.append("")
    L.append("- **Sleep 8+ hours.** This is the single largest recovery lever at 58 kg — "
             "tissue repair and CNS recovery both happen here.")
    L.append("- **Eat in a surplus.** A surplus of roughly +300 to +400 kcal over maintenance "
             "is what turns training into new body mass.")
    L.append("- **Protein 1.6–2.2 g/kg** of bodyweight daily, spread over 3–5 meals.")
    L.append("- **Walk on rest days.** Easy blood flow speeds recovery without adding "
             "training stress.")
    L.append("- **Deload weeks 7 and 12.** Same movements, half the volume. Do not skip them — "
             "they are when adaptation is consolidated.")
    L.append("")
    return "\n".join(L)


def main():
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "project-hybrid-manual.md")
    with open(path, "w") as fh:
        fh.write(build())
    print(f"manual -> {path} ({os.path.getsize(path)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
