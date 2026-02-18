# AGENTS.md - Emilia Webapp

Instructions for Claude / Codex coding agents working on this project.

## Quick Reference

| Item | Value |
|------|-------|
| Location | `/home/tbach/Projects/emilia-project/emilia-webapp` |
| Version | See CHANGELOG.md (latest: 5.7.0) |
| Frontend | React 19 + Vite + TanStack Router + Zustand |
| Backend | FastAPI (modular routers) + SQLite |
| Tests | `backend/tests/`, `frontend/src/**/*.test.ts(x)` |

## Read First

1. `CHANGELOG.md` — Recent changes, current state
2. `DOCUMENTATION.md` — LLM-focused repo map
3. `docs/animation/` — VRM/animation pipeline notes

## Project Structure

```
emilia-webapp/
├── backend/
│   ├── main.py              # App setup + health
│   ├── config.py            # Centralized settings
│   ├── dependencies.py      # Auth + header dependencies
│   ├── routers/             # API routes (8 modules)
│   │   ├── users.py         # User management
│   │   ├── agents.py        # Agent details
│   │   ├── rooms.py         # Room CRUD, history, multi-agent chat
│   │   ├── chat.py          # DM chat facade, transcribe, speak
│   │   ├── memory.py        # Memory file access
│   │   ├── admin.py         # Admin/manage operations
│   │   ├── emotional.py     # Emotion engine debug endpoints
│   │   └── designer_v2.py   # Designer V2 (personality, bonds, calibration)
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # External API clients
│   │   ├── elevenlabs.py    # TTS REST client with alignment
│   │   └── emotion_engine.py # Emotion Engine V2
│   ├── db/
│   │   ├── connection.py    # Database management + migrations
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
│   │   └── games/           # LLM game modules
│   ├── public/              # Static assets
│   │   ├── vrm/             # VRM models + vrm-manifest.json
│   │   └── animations/      # Animation assets + manifest
│   └── dist/                # Production build output
│
├── data/
│   └── emilia.db            # SQLite database
│
├── docs/
│   ├── animation/           # VRM/animation pipeline docs
│   ├── archive/             # Historical docs
│   └── planning/            # Implementation plans
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
User context via `X-User-Id`, `X-Agent-Id` headers.

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

## Database Schema (SQLite)

Defined in `backend/db/connection.py` and auto-initialized.

```sql
-- Users
users (id, display_name, preferences, created_at)

-- Agents (linked to OpenClaw agents)
agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
        chat_mode, direct_model, direct_api_base,
        baseline_valence, baseline_arousal, baseline_dominance,
        emotional_volatility, emotional_recovery, emotional_profile, created_at)

-- User-Agent access (many-to-many)
user_agents (user_id, agent_id)

-- Rooms (canonical chat container — DM or group)
rooms (id, name, room_type, created_by, created_at, last_activity,
       message_count, settings, summary, summary_updated_at, compaction_count)

-- Room participants (many-to-many users)
room_participants (room_id, user_id)

-- Room agents (many-to-many agents + response mode)
room_agents (room_id, agent_id, response_mode, joined_at)

-- Room messages (chat history with sender attribution)
room_messages (id, room_id, sender_type, sender_id, content, timestamp,
              origin, model, processing_ms, usage_prompt_tokens,
              usage_completion_tokens, behavior_intent, behavior_mood,
              behavior_mood_intensity, behavior_energy, behavior_move,
              behavior_game_action)

-- TTS cache
tts_cache (key, voice_id, model_id, voice_settings, text,
           audio_base64, alignment_json, duration_estimate,
           audio_bytes, created_at, last_used, hits)

-- Game stats
game_stats (id, room_id, user_id, agent_id, game_id,
            result, moves, duration_seconds, played_at)

-- Emotional state (per user-agent pair)
emotional_state (id, user_id, agent_id, valence, arousal, dominance,
                 trust, attachment, familiarity,
                 intimacy, playfulness_safety, conflict_tolerance,
                 mood_weights_json, trigger_calibration_json,
                 trigger_buffer, pending_triggers,
                 interaction_count, last_interaction, last_updated)

-- Emotional events V2
emotional_events_v2 (id, user_id, agent_id, session_id, timestamp,
                     message_snippet, triggers_json,
                     valence_before, valence_after,
                     arousal_before, arousal_after,
                     dominant_mood_before, dominant_mood_after,
                     agent_mood_tag, agent_intent_tag, inferred_outcome,
                     trust_delta, intimacy_delta, calibration_updates_json)

-- Trigger counts (per user-agent-trigger)
trigger_counts (user_id, agent_id, trigger_type, window, count, last_seen)

-- Moods
moods (id, description, valence, arousal, emoji, category, created_at)

-- Relationship types
relationship_types (id, description,
                    modifiers, behaviors, response_modifiers,
                    trigger_mood_map, example_responses, extra, created_at)
```

## Common Issues

| Problem | Solution |
|---------|----------|
| TTS 503 | Ensure `ELEVENLABS_API_KEY` is set and valid |
| Missing auth | Set `AUTH_TOKEN` or enable `AUTH_ALLOW_DEV_TOKEN=1` |
| Ad blocker blocks routes | Don't use "admin" in URLs, use "manage" |
| CORS errors | Check `ALLOWED_ORIGINS` in `docker-compose.yml` |
| Missing CLAWDBOT token | Set `CLAWDBOT_TOKEN` (required) |
