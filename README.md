# Emilia Web App

Voice + text chat with animated VRM avatar.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular) + SQLite |
| Avatar | Three.js + @pixiv/three-vrm |
| TTS | ElevenLabs WebSocket API |
| STT | Faster Whisper (remote) |
| LLM | Clawdbot Gateway |

## Quick Start

```bash
# Start everything
docker compose up -d --build

# View logs
docker compose logs -f backend

# Open
open https://localhost:3443
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://localhost:3443 |
| Backend | http://localhost:8080 |
| API Docs | http://localhost:8080/docs |
| Settings | https://localhost:3443/settings |

## Development

```bash
# Backend
cd backend && source .venv/bin/activate
python main.py        # Dev server :8080
pytest -q             # 33 tests

# Frontend
cd frontend
npm run dev -- --host # Dev server :3443
npm test              # 83 tests
npm run build         # Production build
```

## Documentation

| File | Purpose |
|------|---------|
| [AGENTS.md](./AGENTS.md) | Guide for coding agents |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [docs/API.md](./docs/API.md) | Endpoint reference |

## Version

**5.5.1** — See [CHANGELOG.md](./CHANGELOG.md) for details.

---

Built by Ram 🩷
