#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
