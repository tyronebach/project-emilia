# CLAUDE.md — Emilia Backend

Read `AGENTS.md` first. This file only adds backend-oriented guidance.

## Validation Order

1. `cd backend && .venv/bin/python -m pytest -q`
2. `cd backend && ./scripts/run-tests.sh`
3. `docker compose up -d --build backend` when runtime validation matters

If `.venv` is missing:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

## Backend Priorities

- Keep routers thin.
- Put orchestration in `backend/services/`.
- Treat `agents.provider` and `agents.provider_config` as canonical.
- Prefer one current-state codepath over compatibility shims.
- Keep room chat, DM facade, memory, and dreams behavior aligned across stream and non-stream paths.

## High-Risk Areas

- `backend/db/connection.py`: live schema and migrations
- `backend/routers/chat.py`, `backend/routers/rooms.py`: shared chat contract
- `backend/services/providers/`: provider selection and config semantics
- `backend/services/emotion_engine.py`: behavior and relationship changes
- `backend/services/dreams/`: lived experience persistence
- `backend/services/memory/`: embedding and recall behavior

## Commit Guidance

- Prefer atomic commits.
- For documentation sweeps, keep one file per commit when requested.
- Call out any TODO left because repo reality was uncertain.
