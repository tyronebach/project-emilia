# Emilia Backend

FastAPI + SQLite backend for Emilia agents. The live runtime is backend-first: rooms are the canonical chat container, agent responses route through provider adapters (`native` or `openclaw`), and long-term relationship state lives in SQLite plus workspace files where applicable.

Frontend work is in flux and intentionally not documented here. Use this README as the backend entry point and follow the linked docs for details.

## Current Backend Surface

- App entry: `backend/main.py`
- Config: `backend/config.py`
- Routers: `backend/routers/`
- Shared chat runtime: `backend/services/chat_runtime/`, `backend/services/room_chat.py`, `backend/services/room_chat_stream.py`
- Providers: `backend/services/providers/`
- Memory: `backend/services/memory/`
- Dreams: `backend/services/dreams/`
- DB schema and migrations: `backend/db/connection.py`
- CLI: `cli/emilia.py`

Active routers:
- `/api/health`
- `/api/chat`
- `/api/rooms`
- `/api/users`
- `/api/agents`
- `/api/memory`
- `/api/games`
- `/api/manage`
- `/api/debug`
- `/api/dreams`
- `/api/soul-window`
- `/api/designer/v2`

## Run It

Docker:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

Local venv:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
```

Backend URLs:
- API: `http://localhost:8080`
- OpenAPI: `http://localhost:8080/docs`
- Health: `http://localhost:8080/api/health`

Notes:
- Docker uses `/data/emilia.db` in-container and mounts repo `./data` there.
- Local helper script `scripts/dev-backend-local.sh` sets `EMILIA_DB_PATH` to `data/emilia.db`.
- Auth uses `Authorization: Bearer <token>`. User-scoped routes also require `X-User-Id`, and some routes require `X-Agent-Id`.

## Tests

Preferred backend commands:

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && ./scripts/run-tests.sh
```

Do not use host-global `pytest` for backend validation.

## Docs

- [DOCUMENTATION.md](DOCUMENTATION.md): backend repo map, routes, config, and storage
- [backend/docs/DREAMS-RUNBOOK.md](backend/docs/DREAMS-RUNBOOK.md): operational dream checks
- [docs/PROMPT_ASSEMBLY.md](docs/PROMPT_ASSEMBLY.md): chat, dream, and compaction prompt order
- [docs/SOUL-SIMULATOR-API.md](docs/SOUL-SIMULATOR-API.md): `/api/designer/v2/soul/simulate`
- [docs/P006-soul-window-dev-guide.md](docs/P006-soul-window-dev-guide.md): Soul Window backend constraints
- [docs/GLOBAL-DYNAMICS-TUNING.md](docs/GLOBAL-DYNAMICS-TUNING.md): mood injection settings
- [docs/planning/P023-session-recall-lossless-compaction.md](docs/planning/P023-session-recall-lossless-compaction.md): active backend proposal, not implemented
