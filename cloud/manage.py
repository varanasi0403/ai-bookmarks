"""Run the project-local Wrangler without installing global Node packages."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
node=shutil.which('node')
if not node:
    bundled=Path('/Users/divyanshvaranasi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
    if bundled.exists():node=str(bundled)
if not node:raise SystemExit('Install Node.js 22+ to run the cloud deployment tools.')
env={**os.environ,'PATH':str(Path(node).parent)+os.pathsep+os.environ.get('PATH',''),
     'XDG_CONFIG_HOME':str(ROOT/'.cloudflare'),'WRANGLER_LOG_PATH':str(ROOT/'.wrangler/logs'),
     'WRANGLER_SEND_METRICS':'false'}
wrangler=ROOT/'node_modules/wrangler/bin/wrangler.js'
if not wrangler.exists():raise SystemExit('Install the cloud/package.json dependencies first.')
try:
    raise SystemExit(subprocess.call([node,str(wrangler),*sys.argv[1:]],cwd=ROOT,env=env))
except KeyboardInterrupt:
    raise SystemExit(130)
