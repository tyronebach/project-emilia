# AGENTS.md - Emilia Backend

Instructions for coding agents working in this repo. This pass is backend-only; frontend docs are being reduced or archived until that refactor settles.

## Quick Reference

| Item | Value |
|------|-------|
| Location | `/home/tbach/Projects/emilia-project/emilia-webapp` |
| Backend entry | `backend/main.py` |
| Backend stack | FastAPI + SQLite |
| CLI | `cli/emilia.py` |
| Backend tests | `backend/tests/` |

## Read First

1. `README.md`
2. `DOCUMENTATION.md`
3. `CHANGELOG.md`
4. `backend/docs/DREAMS-RUNBOOK.md`
5. `docs/PROMPT_ASSEMBLY.md`
6. `docs/planning/P023-session-recall-lossless-compaction.md` if working on compaction recall work

## Backend Structure

```text
backend/
├── main.py
├── config.py
├── dependencies.py
├── routers/
├── schemas/
├── services/
│   ├── chat_runtime/
│   ├── dreams/
│   ├── emotion/
│   ├── memory/
│   └── providers/
├── db/
│   ├── connection.py
│   ├── migrations/
│   └── repositories/
├── docs/
├── scripts/
└── tests/
```

## Commands

Run backend locally:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
```

Backend checks:

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && ./scripts/run-tests.sh
./scripts/check-backend.sh
```

Backend via Docker:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

## Live Backend Rules

- Rooms are canonical; DM chat is a room-backed facade.
- All authenticated routes require `Authorization: Bearer <token>`.
- User-facing routes typically also require `X-User-Id`; agent-scoped routes may require `X-Agent-Id`.
- `agents.provider` plus `agents.provider_config` are the active runtime source of truth.
- `direct_model` and `direct_api_base` are transitional mirrors only.
- Do not add compatibility layers unless explicitly requested.
- Prefer updating docs to match code over preserving stale design intent.

## Database Notes

Authoritative schema lives in `backend/db/connection.py`.

Key active tables:
- `users`, `agents`, `user_agents`
- `rooms`, `room_participants`, `room_agents`, `room_messages`
- `emotional_state`, `emotional_events_v2`
- `character_lived_experience`, `dream_log`
- `moods`, `relationship_types`, `app_settings`

## Do Not Change Without Approval

- Default model policy (`gpt-5.1-codex-mini` family)
- OpenClaw gateway config outside the repo
- Pushes to `main`
- Production deploy steps

## Test Policy

- Do not run host-global `pytest`.
- Use `cd backend && .venv/bin/python -m pytest -q` or `cd backend && ./scripts/run-tests.sh`.
- If `.venv` is missing:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```
