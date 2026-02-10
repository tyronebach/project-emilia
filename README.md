# Emilia Web App

Voice + text chat with animated VRM avatar.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular) + SQLite |
| Avatar | Three.js + @pixiv/three-vrm |
| TTS | ElevenLabs REST `/with-timestamps` |
| STT | Faster Whisper (remote service) |
| LLM | Clawdbot Gateway (OpenClaw) |

## Quick Start

```bash
# Start everything
docker compose up -d --build

# View logs
docker compose logs -f backend
```

Open `https://localhost:3443`.

## Feature Flags

- `GAMES_V2_ENABLED` (backend, docker-compose default: `1`)
- `VITE_GAMES_V2_ENABLED` (frontend, default: `1`)

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://localhost:3443 |
| Backend | http://localhost:8080 |
| API Docs | http://localhost:8080/docs |
| Agent Settings | https://localhost:3443/manage |
| User Settings | In-app modal (Drawer → User Settings) |

## Development

```bash
# Shortcuts
./scripts/dev-backend.sh    # docker backend + health
./scripts/dev-frontend.sh   # vite dev server
./scripts/check-backend.sh  # backend tests (docker)
./scripts/check-frontend.sh # frontend tests/lint/build
./scripts/check-all.sh

# Backend
cd backend && source .venv/bin/activate
python main.py         # Dev server :8080
pytest -q              # Backend tests
./scripts/run-tests.sh # Backend tests (prefers docker)

# Frontend
cd frontend
npm run dev -- --host # Dev server :3443
npm test              # Vitest
npm run build         # Production build
```

## Documentation

| File | Purpose |
|------|---------|
| `AGENTS.md` | Guide for coding agents |
| `CHANGELOG.md` | Version history |
| `DOCUMENTATION.md` | LLM-focused repo map |
| `docs/animation/` | VRM/animation pipeline notes |

## Avatar Assets

- VRM files live in `frontend/public/vrm/`
- Model list is defined in `frontend/public/vrm/vrm-manifest.json`
- Voice list is defined in `frontend/public/vrm/voice-ids.json`

---

Built by Ram
