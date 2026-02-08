#!/usr/bin/env bash
# Run the Agent Designer frontend (port 3002)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend/designer"

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "Installing designer dependencies..."
    npm install
fi

exec npm run dev
