#!/usr/bin/env bash
# PROJECT HYBRID - rebuild every deliverable from source.
#
#   ./tools/build_all.sh              # poster + manual
#   ./tools/build_all.sh --quick      # 2560x1440 poster (fast preview)
#
# Requires: python3 with pillow, numpy, fontTools (see requirements.txt)
# Fonts are vendored in assets/fonts as TTF, so no network access is needed.

set -euo pipefail
cd "$(dirname "$0")/.."

have_deps() {
  "$1" - <<'EOF' >/dev/null 2>&1
import PIL, numpy, fontTools
EOF
}

# interpreter: $PY override, else the first candidate that can import our deps
PY="${PY:-}"
if [ -z "$PY" ]; then
  for cand in ".venv/bin/python" "python3" "../.venv/bin/python" "python"; do
    if command -v "$cand" >/dev/null 2>&1 && have_deps "$cand"; then PY="$cand"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "error: no Python with pillow/numpy/fontTools found." >&2
  echo "       python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
echo "==> using interpreter: $PY"

SCALE="1.5"
if [ "${1:-}" = "--quick" ]; then SCALE="1"; fi

echo "==> rendering infographic (scale ${SCALE})"
"$PY" tools/build_infographic.py --scale "$SCALE"

echo "==> generating exercise manual"
"$PY" tools/build_manual.py

echo
echo "deliverables in ./output"
ls -la output
