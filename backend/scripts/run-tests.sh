#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export EMILIA_DB_PATH="${EMILIA_DB_PATH:-/tmp/emilia-test.db}"
export AUTH_ALLOW_DEV_TOKEN="${AUTH_ALLOW_DEV_TOKEN:-1}"
export CLAWDBOT_TOKEN="${CLAWDBOT_TOKEN:-test-token}"
export ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-test-elevenlabs-key}"

if [[ "$#" -eq 0 ]]; then
  PYTEST_ARGS=(-q --ignore tests/test_transcribe_manual.py)
else
  PYTEST_ARGS=("$@")
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Running backend tests in Docker (py3.11)..."
  (cd "$REPO_ROOT" && \
    docker compose run --rm \
      -e EMILIA_DB_PATH="$EMILIA_DB_PATH" \
      -e AUTH_ALLOW_DEV_TOKEN="$AUTH_ALLOW_DEV_TOKEN" \
      -e CLAWDBOT_TOKEN="$CLAWDBOT_TOKEN" \
      -e ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" \
      -v "$BACKEND_DIR:/app" \
      backend pytest "${PYTEST_ARGS[@]}")
  exit $?
fi

PYTHON_BIN="${EMILIA_PYTHON_BIN:-$BACKEND_DIR/.venv/bin/python}"
if [[ -x "$PYTHON_BIN" ]]; then
  echo "Running backend tests with venv: $PYTHON_BIN"
  if "$PYTHON_BIN" -c "import sys" >/dev/null 2>&1; then
    "$PYTHON_BIN" -m pytest "${PYTEST_ARGS[@]}"
    exit $?
  fi
  echo "Venv launcher is not executable in this environment, falling back to system python3 with venv site-packages"
fi

echo "Running backend tests with python3"
SITE_PACKAGES="$BACKEND_DIR/.venv/lib/python3.14/site-packages"
if [[ -d "$SITE_PACKAGES" ]]; then
  PYTHONPATH="$SITE_PACKAGES${PYTHONPATH:+:$PYTHONPATH}" python3 -m pytest "${PYTEST_ARGS[@]}"
else
  python3 -m pytest "${PYTEST_ARGS[@]}"
fi
