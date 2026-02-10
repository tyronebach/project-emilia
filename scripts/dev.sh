#!/usr/bin/env bash
# Development server launcher
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== Emilia Development Servers ==="
echo ""
if [ ! -f "$ROOT_DIR/.env" ]; then
echo "Missing .env. Initialize it first:"
echo "  cp .env.example .env"
echo "  # then edit .env and set CLAWDBOT_TOKEN (and ELEVENLABS_API_KEY if needed)"
echo ""
fi
echo "Environment source: .env in repo root"
echo ""
echo "Run these in separate terminals:"
echo ""
echo "  Backend (port 8080):"
echo "    ./scripts/dev-backend-local.sh    # Local Python"
echo "    ./scripts/dev-backend.sh          # Docker"
echo ""
echo "  Game Frontend (port 3443):"
echo "    ./scripts/dev-frontend.sh"
echo ""
echo "=== Quick Start (2 terminals) ==="
echo ""
echo "  Terminal 1: ./scripts/dev-backend-local.sh"
echo "  Terminal 2: ./scripts/dev-frontend.sh"
echo ""
echo "=== URLs ==="
echo ""
echo "  Game:     https://localhost:3443"
echo "  API:      http://localhost:8080/api/health"
echo ""
