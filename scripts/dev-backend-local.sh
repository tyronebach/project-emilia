#!/usr/bin/env bash
# Run backend locally (without Docker) on port 8080
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

# Activate venv
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "No .venv found. Create with: python3 -m venv .venv && pip install -r requirements.txt"
    exit 1
fi

# Check for required env vars
if [ -z "${CLAWDBOT_TOKEN:-}" ]; then
    echo "Warning: CLAWDBOT_TOKEN not set. Some features may not work."
fi

exec python -m uvicorn main:app --reload --port 8080 --host 0.0.0.0
