"""Run with .proxy-venv/bin/python setup_proxy.py in an interactive terminal."""
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parent
os.environ['CHATGPT_TOKEN_DIR'] = str(root / '.tokens')
(root / '.tokens').mkdir(mode=0o700, exist_ok=True)
from litellm.llms.chatgpt.authenticator import Authenticator
Authenticator().get_access_token()
p = root / '.env'
text = p.read_text() if p.exists() else (root / '.env.example').read_text()
lines = text.splitlines()
existing = next((line.partition('=')[2] for line in lines if line.startswith('LITELLM_API_KEY=')), '')
key = existing or 'sk-' + secrets.token_urlsafe(32)
lines = [('LITELLM_API_KEY='+key if line.startswith('LITELLM_API_KEY=') else line) for line in lines]
p.write_text('\n'.join(lines)+'\n')
p.chmod(0o600)
print('Login saved locally. Run ./run-proxy.sh, then restart ./run.sh.')
