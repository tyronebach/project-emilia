#!/usr/bin/env bash
# Run backend locally (without Docker) on port 8080
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load local env file if present.
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
fi

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
    echo "Error: CLAWDBOT_TOKEN is not set."
    echo "Set it in $ROOT_DIR/.env (copy from .env.example) or export it in your shell."
    exit 1
fi

# Keep local DB path aligned with docker volume persistence.
export EMILIA_DB_PATH="${EMILIA_DB_PATH:-$ROOT_DIR/data/emilia.db}"

exec python -m uvicorn main:app --reload --port 8080 --host 0.0.0.0
