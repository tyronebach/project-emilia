# AGENTS.md - Emilia Webapp

Instructions for Claude coding agents working on this project.

## Quick Reference

| Item | Value |
|------|-------|
| Location | `/home/tbach/Projects/emilia-project/emilia-webapp` |
| Version | 5.5.3 |
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular routers) + SQLite |
| Tests | Backend: 39, Frontend: 83 |

## Read First

1. **CHANGELOG.md** — Recent changes, current state
2. **docs/API.md** — Endpoint reference with examples

## Project Structure

```
emilia-webapp/
├── backend/
│   ├── main.py              # App setup + health only (54 lines)
│   ├── config.py            # Centralized settings
│   ├── dependencies.py      # Auth + header dependencies
│   ├── routers/             # API routes (6 modules)
│   │   ├── users.py         # User management
│   │   ├── agents.py        # Agent details
│   │   ├── sessions.py      # Session CRUD + history
│   │   ├── chat.py          # Chat, transcribe, speak
│   │   ├── memory.py        # Memory file access
│   │   └── admin.py         # Admin/manage operations
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # External API clients
│   │   ├── clawdbot.py      # LLM gateway client
│   │   ├── elevenlabs.py    # TTS WebSocket client
│   │   └── stt.py           # Speech-to-text client
│   ├── db/
│   │   ├── connection.py    # Database management
│   │   └── repositories/    # CRUD operations
│   └── core/exceptions.py   # Custom exceptions
│
├── frontend/
│   ├── src/
│   │   ├── routes/          # TanStack Router pages
│   │   ├── components/      # React components
│   │   ├── store/           # Zustand state management
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/api.ts     # API client with auth
│   │   ├── avatar/          # Three.js + VRM avatar system
│   │   └── types.ts         # TypeScript types
│   ├── public/              # Static assets
│   │   └── vrm/             # VRM models + vrm-manifest.json
│   └── dist/                # Production build output
│
├── data/
│   └── emilia.db            # SQLite database
│
├── docs/
│   ├── API.md               # Endpoint documentation
│   └── ARCHITECTURE.md      # Network/security design
│
├── docker-compose.yml       # Container orchestration
├── nginx.conf               # Frontend proxy config
└── CHANGELOG.md             # Version history
```

## Commands

```bash
# Full stack (recommended)
docker compose up -d --build
docker compose logs -f backend

# Backend only
cd backend
source .venv/bin/activate
python main.py                # Dev server :8080
pytest -q                     # Run tests
./scripts/run-tests.sh        # Backend tests (prefers docker)

# Frontend only
cd frontend
npm install
npm run dev -- --host         # Dev server :3443
npm run build                 # Production build
npm test                      # Run tests
npm run lint                  # ESLint
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://localhost:3443 |
| Backend | http://localhost:8080 |
| API Docs | http://localhost:8080/docs |
| Settings | https://localhost:3443/settings |

## Key Patterns

### API Authentication
All endpoints require `Authorization: Bearer {token}` header.
User context via `X-User-Id`, `X-Agent-Id`, `X-Session-Id` headers.

### State Management
- **Zustand** for client state (user, agent, session, UI)
- **React Query** for server state (API calls)
- Don't mix them

### Avatar Assets
- VRM files live in `frontend/public/vrm/`
- `vrm-manifest.json` drives the debug model selector
- `voice-ids.json` lists available TTS voices

### Adding Endpoints
1. Create/update router in `backend/routers/`
2. Add request/response models in `backend/schemas/`
3. Register router in `backend/main.py`

### Adding Components
1. Create component in `frontend/src/components/`
2. Add route in `frontend/src/routes/` if needed
3. Update `routeTree.gen.ts` for new routes

## Don't Touch Without Approval

- **Model config** — Agents use `gpt-5.1-codex-mini`, don't change
- **Gateway config** — `~/.clawdbot/clawdbot.json`
- **Push to main** — Always ask first
- **Deploy to production** — Always ask first

## Database Schema

```sql
-- Users
users (id, display_name, preferences, created_at)

-- Agents (linked to Clawdbot agents)
agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, created_at)

-- User-Agent access (many-to-many)
user_agents (user_id, agent_id)

-- Sessions
sessions (id, agent_id, name, created_at, last_used, message_count)

-- Session participants (many-to-many)
session_participants (session_id, user_id)
```

## Common Issues

| Problem | Solution |
|---------|----------|
| TTS 500 error | Check `websockets` version, use `additional_headers` not `extra_headers` |
| Ad blocker blocks routes | Don't use "admin" in URLs, use "manage" or "settings" |
| Session history empty | Check JSONL file exists in agent's sessions directory |
| CORS errors | Check `ALLOWED_ORIGINS` in docker-compose.yml |

---

**Maintainer:** Ram 🩷
