#!/bin/bash
# Run emotion scenario tests in Docker
set -e

cd "$(dirname "$0")/.."

echo "Running emotion scenario tests in Docker..."

# Mount backend to ensure latest code is used
docker compose run --rm \
  -e EMILIA_DB_PATH=/tmp/test.db \
  -e EMILIA_SEED_DATA=0 \
  -e CLAWDBOT_TOKEN=test \
  -v "$PWD/backend:/app:ro" \
  -v "$PWD/scripts:/scripts:ro" \
  backend python /scripts/test-emotion-scenarios.py "$@"
