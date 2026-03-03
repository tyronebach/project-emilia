#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${CLI_BASE_URL:-http://localhost:8080}"
AUTH_TOKEN="${AUTH_TOKEN:-emilia-dev-token-2026}"
AUTH_ALLOW_DEV_TOKEN="${AUTH_ALLOW_DEV_TOKEN:-1}"
CLAWDBOT_TOKEN="${CLAWDBOT_TOKEN:-test-token}"
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-test-elevenlabs-key}"
EMILIA_DB_PATH="${EMILIA_DB_PATH:-/tmp/emilia-cli-smoke.db}"
PYTHON_BIN="${EMILIA_PYTHON_BIN:-$ROOT/backend/.venv/bin/python}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
  if [[ ! -x "$PYTHON_BIN" ]]; then
    PYTHON_BIN="python3"
  fi
  (
    cd "$ROOT/backend"
    AUTH_TOKEN="$AUTH_TOKEN" \
    AUTH_ALLOW_DEV_TOKEN="$AUTH_ALLOW_DEV_TOKEN" \
    CLAWDBOT_TOKEN="$CLAWDBOT_TOKEN" \
    ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" \
    EMILIA_DB_PATH="$EMILIA_DB_PATH" \
    "$PYTHON_BIN" main.py
  ) >/tmp/emilia-cli-backend.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do
    if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -fsS "$BASE_URL/api/health" >/dev/null
fi

cd "$ROOT"
export CLI_BASE_URL="$BASE_URL"
export AUTH_TOKEN
export AUTH_ALLOW_DEV_TOKEN

python3 cli/emilia.py setup >/tmp/emilia-cli-setup.json
SEND_OUTPUT="$(python3 cli/emilia.py send "Hello, who are you?")"
test -n "$SEND_OUTPUT"
MEMORY_OUTPUT="$(python3 cli/emilia.py memory list)"
HISTORY_OUTPUT="$(python3 cli/emilia.py history --limit 5)"

test -n "$MEMORY_OUTPUT"
test -n "$HISTORY_OUTPUT"
