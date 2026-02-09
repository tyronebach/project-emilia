# AGENTS.md - Emilia Webapp

Instructions for Claude coding agents working on this project.

## Quick Reference

| Item | Value |
|------|-------|
| Location | `/home/tbach/Projects/emilia-project/emilia-webapp` |
| Version | 5.5.3 |
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular routers) + SQLite |
| Tests | Backend: 140, Frontend: 93 |

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
│   ├── routers/             # API routes (8 modules)
│   │   ├── users.py         # User management
│   │   ├── agents.py        # Agent details
│   │   ├── sessions.py      # Session CRUD + history
│   │   ├── chat.py          # Chat, transcribe, speak
│   │   ├── memory.py        # Memory file access
│   │   ├── admin.py         # Admin/manage operations
│   │   ├── emotional.py     # Emotion engine debug endpoints
│   │   └── designer_v2.py   # Designer V2 (personality, bonds, calibration)
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # External API clients
│   │   ├── elevenlabs.py    # TTS WebSocket client
│   │   └── emotion_engine.py # Emotion Engine V2
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
| Agent Settings | https://localhost:3443/manage |
| User Settings | In-app modal (Drawer → User Settings) |

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
- **Gateway config** — `~/.openclaw/openclaw.json`
- **Push to main** — Always ask first
- **Deploy to production** — Always ask first

## Database Schema

```sql
-- Users
users (id, display_name, preferences, created_at)

-- Agents (linked to OpenClaw agents)
agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
        baseline_valence, baseline_arousal, baseline_dominance,
        emotional_volatility, emotional_recovery, emotional_profile, created_at)

-- User-Agent access (many-to-many)
user_agents (user_id, agent_id)

-- Sessions
sessions (id, agent_id, name, created_at, last_used, message_count)

-- Session participants (many-to-many)
session_participants (session_id, user_id)

-- Messages
messages (id, session_id, role, content, timestamp)

-- TTS cache
tts_cache (text_hash, voice_id, audio_base64, alignment_json, created_at)

-- Game stats
game_stats (user_id, agent_id, game_type, wins, losses, draws, last_played)

-- Emotional state (per user-agent pair)
emotional_state (user_id, agent_id, valence, arousal, dominance,
                 trust, attachment, familiarity, intimacy,
                 playfulness_safety, conflict_tolerance,
                 mood_weights_json, trigger_calibration_json,
                 interaction_count, last_interaction, last_updated)

-- Emotional events (V1 legacy)
emotional_events (id, user_id, agent_id, session_id, trigger, intensity,
                  valence_before, valence_after, arousal_before, arousal_after, timestamp)

-- Emotional events V2
emotional_events_v2 (id, user_id, agent_id, session_id, message_snippet,
                     triggers_json, state_before_json, state_after_json,
                     agent_behavior_json, outcome, timestamp)

-- Trigger counts (per user-agent-trigger)
trigger_counts (user_id, agent_id, trigger_type, count, last_seen)

-- Moods (mood weight snapshots)
moods (id, user_id, agent_id, mood_weights_json, timestamp)

-- Relationship types (reference table)
relationship_types (id, name, description)
```

## Common Issues

| Problem | Solution |
|---------|----------|
| TTS 500 error | Check `websockets` version, use `additional_headers` not `extra_headers` |
| Ad blocker blocks routes | Don't use "admin" in URLs, use "manage" |
| Session history empty | Check JSONL file exists in agent's sessions directory |
| CORS errors | Check `ALLOWED_ORIGINS` in docker-compose.yml |

---

**Maintainer:** Ram 🩷
