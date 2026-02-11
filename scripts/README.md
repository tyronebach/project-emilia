# Development Scripts

## Quick Start

Run each in a separate terminal:

```bash
# Terminal 1: Backend API (port 8080)
./scripts/dev-backend-local.sh

# Terminal 2: Frontend (port 3443)
./scripts/dev-frontend.sh
```

## Scripts

| Script | Description | Port |
|--------|-------------|------|
| `dev.sh` | Print dev shortcuts | - |
| `dev-backend-local.sh` | Run backend locally (Python) | 8080 |
| `dev-backend.sh` | Run backend via Docker | 8080 |
| `dev-frontend.sh` | Run Vite frontend (HTTPS) | 3443 |
| `check-backend.sh` | Backend tests (docker) | - |
| `check-frontend.sh` | Frontend tests/lint/build | - |
| `check-all.sh` | Run backend + frontend checks | - |
| `test-scenarios.sh` | Run emotion scenario suite | - |
| `test-dialogues.py` | Run dialogue fixtures | - |
| `test-emotion-scenarios.py` | Run emotion scenario fixtures | - |
| `emotion-lab.py` | Interactive emotion tuning lab | - |
| `compare-trigger-detection.py` | Legacy trigger-detection comparison utility (may require adaptation) | - |

## URLs

- Frontend: https://localhost:3443
- API Health: http://localhost:8080/api/health
- API Docs: http://localhost:8080/docs

## Environment

Use repo root `.env` (copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env and set at least:
# - CLAWDBOT_TOKEN
# - ELEVENLABS_API_KEY (if using TTS)
```

Both backend launchers (`dev-backend-local.sh` and `dev-backend.sh`) read `.env`.

## Testing Emotion Engine

```bash
# Run unit tests
cd backend && .venv/bin/python -m pytest tests/test_emotion_engine.py -v

# Run dialogue scenarios
./scripts/test-scenarios.sh

# Interactive tuning lab
cd backend && .venv/bin/python ../scripts/emotion-lab.py
```
