#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python - <<'PY'
from pathlib import Path
import secrets
p = Path('.env')
if not p.exists():
    text = Path('.env.example').read_text().replace('APP_PASSWORD=\n', 'APP_PASSWORD='+secrets.token_urlsafe(18)+'\n').replace('COOKIE_SECRET=\n', 'COOKIE_SECRET='+secrets.token_hex(32)+'\n')
    p.write_text(text)
    p.chmod(0o600)
print('Ready. App password is in .env. Run ./run.sh')
PY
