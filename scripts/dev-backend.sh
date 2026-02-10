#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env so we can preflight required vars before compose.
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [ -z "${CLAWDBOT_TOKEN:-}" ]; then
  echo "Error: CLAWDBOT_TOKEN is not set."
  echo "Set it in $ROOT_DIR/.env (copy from .env.example) or export it in your shell."
  exit 1
fi

docker compose up -d --build backend

echo "Waiting for backend health..."
for i in {1..60}; do
  if curl -fsS http://localhost:8080/api/health >/dev/null; then
    echo "Backend healthy."
    exit 0
  fi
  sleep 2
done

echo "Backend health check timed out." >&2
exit 1
