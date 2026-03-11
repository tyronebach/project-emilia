# Development Scripts

Backend-relevant helpers in this repo root.

## Common Commands

```bash
./scripts/dev-backend-local.sh
./scripts/dev-backend.sh
./scripts/check-backend.sh
./scripts/check-all.sh
```

## Script Map

| Script | What it does |
|--------|---------------|
| `scripts/dev-backend-local.sh` | loads repo `.env`, requires `backend/.venv`, runs `uvicorn main:app --reload` on `:8080` |
| `scripts/dev-backend.sh` | starts Docker Compose backend only and waits for `/api/health` |
| `scripts/check-backend.sh` | delegates to `backend/scripts/run-tests.sh` |
| `scripts/check-all.sh` | backend + frontend checks; frontend half is not maintained in this backend docs pass |
| `scripts/dev.sh` | prints shortcut help |
| `scripts/test-scenarios.sh` | emotion scenario helper |
| `scripts/test-dialogues.py` | dialogue fixture runner |
| `scripts/test-emotion-scenarios.py` | emotion scenario fixture runner |
| `scripts/emotion-lab.py` | interactive emotion tuning helper |

## Backend URLs

- Health: `http://localhost:8080/api/health`
- OpenAPI: `http://localhost:8080/docs`

## Notes

- `scripts/dev-backend-local.sh` sets `EMILIA_DB_PATH` to `data/emilia.db` unless already set.
- Both backend launchers expect `CLAWDBOT_TOKEN` to be available.
- For backend tests, prefer `cd backend && .venv/bin/python -m pytest -q` or `cd backend && ./scripts/run-tests.sh`.
