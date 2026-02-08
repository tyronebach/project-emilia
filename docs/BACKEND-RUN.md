# Backend Docker Runbook

Quick reference for running the backend with Docker.

---

## Prereqs

- Docker daemon running
- Secrets env file: `/home/tbach/.openclaw/secrets.env` (must contain `CLAWDBOT_TOKEN`, `ELEVENLABS_API_KEY`)

---

## Shortcuts

```bash
# Start backend and wait for health
./scripts/dev-backend.sh

# Backend tests (docker)
./scripts/check-backend.sh
```

## Build & Run

```bash
# Build and start backend
docker compose up -d --build backend

# Build and start everything (backend + frontend nginx)
docker compose up -d --build
```

## Stop & Restart

```bash
# Stop all
docker compose down

# Stop backend only
docker compose stop backend

# Restart backend
docker compose restart backend
```

## Rebuild from Scratch

```bash
# Full rebuild (no cache)
docker compose down
docker compose build --no-cache backend
docker compose up -d
```

## Logs

```bash
# Follow logs
docker compose logs -f backend

# Last 100 lines
docker compose logs --tail 100 backend
```

## Health Check

```bash
curl http://localhost:8080/api/health
```

## Run Tests in Docker (Python 3.11)

```bash
docker compose run --rm \
  -e EMILIA_DB_PATH=/tmp/emilia-test.db \
  -e AUTH_ALLOW_DEV_TOKEN=1 \
  -e CLAWDBOT_TOKEN=test-token \
  -e ELEVENLABS_API_KEY=test-key \
  -e EMILIA_SEED_DATA=0 \
  -v "$(pwd)/backend:/app" \
  backend pytest -v
```

---

## Notes

- Backend uses `network_mode: host` and listens on port `8080`
- DB volume: `./data:/data`
- Agent workspaces: `/home/tbach/clawd-agents` mounted read-write
- Frontend depends on backend being healthy before starting
