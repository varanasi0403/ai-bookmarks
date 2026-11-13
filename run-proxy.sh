#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec .proxy-venv/bin/python - <<'PY'
import os
from pathlib import Path
from dotenv import dotenv_values
config = dotenv_values('.env')
if not config.get('LITELLM_API_KEY'):
    raise SystemExit('Run setup_proxy.py in an interactive terminal first.')
os.environ['LITELLM_MASTER_KEY'] = config['LITELLM_API_KEY']
os.environ['CHATGPT_TOKEN_DIR'] = str(Path('.tokens').resolve())
os.execv('.proxy-venv/bin/litellm', ['litellm', '--config', 'litellm.yaml', '--host', '127.0.0.1', '--port', '4000', '--num_workers', '1'])
PY
