# Emilia Backend Documentation

Backend-only repo map for the current codebase. This file tracks what exists now, not planned frontend work.

## Top Level

- `backend/`: FastAPI app, runtime services, SQLite schema, tests
- `cli/emilia.py`: backend CLI client
- `data/`: persisted SQLite database for local and Docker-backed runs
- `docs/`: active backend docs plus planning docs that are still open
- `docs/archive/`: historical, superseded, or frontend-heavy material
- `scripts/`: local backend/dev helper scripts

## Backend Entry Points

- `backend/main.py`: app creation, CORS, router registration, `/api/health`, dream scheduler loop
- `backend/config.py`: env-driven settings and runtime validation
- `backend/dependencies.py`: auth and header dependencies
- `backend/db/connection.py`: SQLite path resolution, schema init, migrations
- `backend/schemas/requests.py`, `backend/schemas/responses.py`: API contracts

## Routers

- `backend/routers/chat.py`: DM facade, STT, TTS
- `backend/routers/rooms.py`: canonical room CRUD, history, multi-agent chat
- `backend/routers/users.py`: users and user-visible agent/room lookups
- `backend/routers/agents.py`: user-scoped agent detail
- `backend/routers/memory.py`: workspace-backed memory file access and search
- `backend/routers/admin.py`: manage routes for users, agents, games, and compaction debug
- `backend/routers/emotional.py`: debug-only emotional state routes
- `backend/routers/designer_v2.py`: personality, calibration, bonds, archetypes, soul simulation
- `backend/routers/soul_window.py`: user-facing mood, bond, about, and events routes
- `backend/routers/dreams.py`: lived experience status, log, trigger, reset
- `backend/routers/games.py`: public game catalog for the active agent

## Runtime Services

Chat and providers:
- `backend/services/chat_runtime/`: shared orchestration used by DM and room paths
- `backend/services/room_chat.py`: prompt building, responding-agent selection, shared helpers
- `backend/services/room_chat_stream.py`: SSE room streaming
- `backend/services/providers/`: provider interface, native provider, OpenClaw provider, registry
- `backend/services/direct_llm.py`: OpenAI-compatible client and system prompt prepend
- `backend/services/direct_tool_runtime.py`: tool loop for native provider

Emotion and behavior:
- `backend/services/emotion_engine.py`: trigger detection, mood injection, relationship deltas
- `backend/services/emotion_runtime.py`: chat-time emotion hooks
- `backend/services/behavioral_rules.py`: trust/fragility prompt rules
- `backend/services/emotion/`: calibration, inference, taxonomy helpers

Memory and context:
- `backend/services/memory/`: embeddings, indexing, search, read/write, auto-capture, top-of-mind
- `backend/services/memory_bridge.py`: compatibility bridge into the standalone memory service
- `backend/services/chat_context_runtime.py`: first-turn facts and game context helpers
- `backend/services/agent_context.py`: workspace persona loading helpers

Dreams and compaction:
- `backend/services/dreams/runtime.py`: dream execution
- `backend/services/dreams/scheduler.py`: hourly background scan
- `backend/services/compaction.py`: room summary compaction
- `backend/services/soul_simulator.py`: stateless SOUL persona simulator

Supporting modules:
- `backend/services/observability.py`: structured log metrics
- `backend/services/workspace_events.py`: Soul Window events file IO
- `backend/services/soul_window_service.py`: Soul Window read models
- `backend/services/soul_parser.py`: SOUL.md parsing

## Storage Model

SQLite lives at:
- Docker default: `/data/emilia.db`
- Local helper default: `<repo>/data/emilia.db`
- Override: `EMILIA_DB_PATH`

Important tables:
- `users`, `agents`, `user_agents`
- `rooms`, `room_participants`, `room_agents`, `room_messages`
- `emotional_state`, `emotional_events_v2`
- `character_lived_experience`, `dream_log`
- `game_stats`, `tts_cache`, `moods`, `relationship_types`, `app_settings`
- `drift_archetypes` remains for Designer archetype data; it is not the active relationship runtime

Read the schema in `backend/db/connection.py` for the authoritative column list.

## Commands

Backend only:

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

CLI examples:

```bash
python3 cli/emilia.py health
python3 cli/emilia.py agents list
python3 cli/emilia.py rooms list
python3 cli/emilia.py dream status --agent AGENT_ID --user USER_ID
```

## Current Backend Rules

- Rooms are the only chat container; DM is a `room_type='dm'` room.
- `/api/chat` is a facade over the shared room pipeline.
- `agents.provider` and `agents.provider_config` are the canonical runtime selector/config.
- `direct_model` and `direct_api_base` still exist as legacy mirrors and fallbacks.
- Dreams own long-horizon relationship narration; legacy drift simulation routes remain deprecated diagnostics.
- Soul Window routes require OpenClaw to be configured and return `503` otherwise.

## Further Reading

- [README.md](README.md)
- [backend/docs/DREAMS-RUNBOOK.md](backend/docs/DREAMS-RUNBOOK.md)
- [docs/PROMPT_ASSEMBLY.md](docs/PROMPT_ASSEMBLY.md)
- [docs/SOUL-SIMULATOR-API.md](docs/SOUL-SIMULATOR-API.md)
- [docs/planning/P023-session-recall-lossless-compaction.md](docs/planning/P023-session-recall-lossless-compaction.md)
