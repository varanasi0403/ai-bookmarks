#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python - <<'PY'
from pathlib import Path
p = Path('.env')
if not p.exists():
    text = Path('.env.example').read_text()
    p.write_text(text)
    p.chmod(0o600)
print('AI BookMarks is ready. Run sh run.sh — no app password required.')
PY
