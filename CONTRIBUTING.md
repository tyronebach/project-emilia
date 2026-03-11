# Contributing

This guide is intentionally backend-only. Frontend docs are in flux and are being archived or rewritten separately.

## Start Here

Read, in order:

1. `README.md`
2. `DOCUMENTATION.md`
3. `AGENTS.md`
4. `CHANGELOG.md`

## Local Backend Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Run locally:

```bash
.venv/bin/python main.py
```

Or use the helper:

```bash
./scripts/dev-backend-local.sh
```

Docker backend:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

## Environment

Common variables:

| Variable | Purpose |
|----------|---------|
| `AUTH_TOKEN` | bearer token for API auth |
| `AUTH_ALLOW_DEV_TOKEN` | set to `1` for the dev token |
| `CLAWDBOT_TOKEN` | required for OpenClaw-backed flows |
| `OPENAI_API_KEY` | required for native direct provider calls |
| `ELEVENLABS_API_KEY` | required for `/api/speak` |
| `EMILIA_DB_PATH` | override SQLite path |
| `OPENCLAW_GATEWAY_URL` | enables Soul Window routes and OpenClaw-specific behavior |

`scripts/dev-backend-local.sh` loads repo `.env` if present and defaults the DB path to `data/emilia.db`.

## Testing

Preferred commands:

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && ./scripts/run-tests.sh
./scripts/check-backend.sh
```

Do not use host-global `pytest`.

## Backend Conventions

- Add routes in `backend/routers/`.
- Put request and response models in `backend/schemas/`.
- Register new routers in `backend/main.py`.
- Keep SQL in repositories, not routers.
- Keep long orchestration in services, not repositories.
- Update docs when runtime behavior changes.

## Documentation Rules

- Active docs live outside `docs/archive/`.
- Historical reviews, completed plans, and frontend-heavy notes belong in `docs/archive/`.
- If code and docs disagree, fix the doc to match the code.
- If something cannot be verified quickly, leave an explicit `TODO`.
