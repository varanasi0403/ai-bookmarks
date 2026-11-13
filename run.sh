#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then echo 'Run ./setup.sh first.'; exit 1; fi
exec .venv/bin/python -m uvicorn app.main:app --host "${SIGNAL_HOST:-0.0.0.0}" --port "${SIGNAL_PORT:-8080}"
