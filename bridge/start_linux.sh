#!/bin/bash
# MPC Touch Studio bridge — dubbelklik om te starten (Linux)
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Eerste keer: installeren..."
  python3 -m venv .venv && ./.venv/bin/pip install -q -r requirements.txt || { echo "Installeren mislukt. Is Python 3 geïnstalleerd? (python.org)"; read -r; exit 1; }
fi
./.venv/bin/python mpc_bridge.py "$@"
