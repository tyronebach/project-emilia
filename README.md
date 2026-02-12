# Emilia Web App

Voice + text chat with animated VRM avatar, including 1:1 sessions and group rooms.

Current backend app version: `5.6.3`.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular) + SQLite |
| Avatar | Three.js + @pixiv/three-vrm |
| TTS | ElevenLabs REST `/with-timestamps` |
| STT | Faster Whisper (remote service) |
| LLM | Mixed mode per agent: OpenClaw gateway (`openclaw`) or direct OpenAI-compatible (`direct`) |

## Core Features

- 1:1 chat sessions with streaming SSE responses and avatar behavior tags.
- Group rooms with multi-agent participation.
- Per-agent chat backend toggle:
  - `openclaw` -> `agent:{clawdbot_agent_id}` via gateway
  - `direct` -> OpenAI-compatible `/chat/completions` with memory tool loop (`memory_search`, `memory_read`, `memory_write`)
  - rooms support mixed mode per responding agent.
  - In-chat mode toggle pill in header (amber "Direct" / blue "OC").
- Emotion engine with per user-agent persistent state and calibration.
- Designer SOUL simulator API for quick persona consistency checks (`POST /api/designer/v2/soul/simulate`).
- Soul Window UX:
  - Header mood indicator (live from SSE `emotion.snapshot`).
  - Bond modal (`/api/soul-window/bond`).
  - About modal from workspace `SOUL.md` (`/api/soul-window/about`).
  - Events timeline (`/api/soul-window/events`).

## Quick Start

```bash
# Start everything
docker compose up -d --build

# View logs
docker compose logs -f backend
```

Open `https://localhost:3443`.

Direct mode note:
- `OPENAI_API_KEY` must be set for backend when using `chat_mode=direct`.
- `GEMINI_API_KEY` must be set for memory search embeddings in direct mode.
- For OpenAI direct calls, use provider model IDs (example: `gpt-4.1-mini`) rather than OpenClaw-style model prefixes.

## Feature Flags

- `GAMES_V2_AGENT_ALLOWLIST` (backend; optional comma-separated agent IDs for staged rollout)
- `VITE_GAMES_V2_AGENT_ALLOWLIST` (frontend; optional comma-separated agent IDs mirroring backend allowlist)

## Adding A New Game

`/manage` (Games tab) handles backend catalog/config only. A game appears in the player UI only when both backend and frontend are wired.

1. Build frontend game module under `frontend/src/games/modules/<game-id>/` (module + renderer + loader contract export).
2. Add dynamic loader manifest entry in `frontend/src/games/loaders/manifest.ts` with the same `gameId`.
3. Register game metadata in `/manage` (or `POST /api/manage/games`) using the same `id`/`module_key`.
4. Enable the game for target agents in `/manage` (`agent_game_config` path).
5. Ensure rollout allowlists include that agent when allowlist mode is enabled.

If the backend catalog contains a game but no frontend loader exists, the selector intentionally filters it out.

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://localhost:3443 |
| Backend | http://localhost:8080 |
| API Docs | http://localhost:8080/docs |
| Agent Settings | https://localhost:3443/manage |
| Group Rooms | https://localhost:3443/user/{userId}/rooms |
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
.venv/bin/python main.py         # Dev server :8080
.venv/bin/python -m pytest -q    # Backend tests
./scripts/run-tests.sh # Backend tests (prefers docker)

# Frontend
cd frontend
npm run dev -- --host # Dev server :3443
npx vitest run        # Vitest
npm run build         # Production build
```

## Documentation

| File | Purpose |
|------|---------|
| `AGENTS.md` | Guide for coding agents |
| `CHANGELOG.md` | Version history |
| `DOCUMENTATION.md` | LLM-focused repo map |
| `docs/IMPL-DIRECT-MODE.md` | Direct mode V1+V2 implementation doc |
| `docs/CODE-REVIEW-GROUP-CHAT.md` | Group chat code review and gap analysis |
| `docs/SOUL-SIMULATOR-API.md` | SOUL simulator endpoint contract |
| `docs/P006-soul-window-dev-guide.md` | Soul Window implementation and extension guide |
| `docs/planning/P010-direct-mode-v2-checklist.md` | Direct mode V2 checklist (completed) |
| `docs/planning/archive/P006-soul-window.md` | Soul Window canonical plan |
| `docs/planning/archive/DRIFT-API.md` | Drift Simulator API contract |
| `docs/animation/` | VRM/animation pipeline notes |

## Avatar Assets

- VRM files live in `frontend/public/vrm/`
- Model list is defined in `frontend/public/vrm/vrm-manifest.json`
- Voice list is defined in `frontend/public/vrm/voice-ids.json`

---

Built by Ram
