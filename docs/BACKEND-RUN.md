# Backend Docker Runbook

Quick reference for running the backend with Docker.

---

## Prereqs

- Docker daemon running
- Access to the secrets env file used in `docker-compose.yml`
  - Default: `/home/tbach/.clawdbot/secrets.env`

---

## Run Backend (Docker Compose)

From the repo root:

```bash
docker compose up -d --build backend
```

Logs:

```bash
docker compose logs -f backend
```

Stop:

```bash
docker compose stop backend
```

Remove container:

```bash
docker compose rm -f backend
```

---

## Health Check

```bash
curl http://localhost:8080/api/health
```

---

## Run Backend Tests in Docker (py3.11)

This mounts the local backend source into the container so tests are available:

```bash
docker compose run --rm \
  -e EMILIA_DB_PATH=/tmp/emilia-test.db \
  -e AUTH_ALLOW_DEV_TOKEN=1 \
  -e CLAWDBOT_TOKEN=test-token \
  -e ELEVENLABS_API_KEY=test-elevenlabs-key \
  -v "$(pwd)/backend:/app" \
  backend pytest -q --ignore tests/test_transcribe_manual.py
```

---

## Notes

- The backend container uses `network_mode: host` and listens on port `8080`.
- DB volume is mounted from `./data` to `/data` (see `docker-compose.yml`).
