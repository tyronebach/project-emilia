# Emilia Web App — LLM Agent Documentation

**Purpose**: Trusted household LLM avatar chat app with VRM rendering, games, emotion engine, and extensive debug tools. Backend connects to OpenClaw/Clawdbot gateway.

**Primary Systems**
- VRM viewer + animation system (Three.js + VRM + animation graph, lip sync, post-processing).
- LLM chat interface + game extensions (prompt injection + move parsing).
- LLM-driven emotion engine (state persistence, trigger detection, calibration).
- Debug panels for VRM display, voice pipeline, and LLM/emotion interactions.

---

## Repo Overview

**Top-level directories**
- `backend/`: FastAPI API + SQLite persistence + emotion engine.
- `frontend/`: React 19 + Vite UI, VRM renderer, games, debug tools.
- `data/`: SQLite DB (`emilia.db`).
- `docs/`: Animation pipeline research, archived plans/specs.
- `scripts/`: Dev/test helper scripts.
- `certs/`: Self-signed certs for HTTPS dev server.

**Key entry points**
- Backend app: `backend/main.py`
- Frontend app: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Router: `frontend/src/router.tsx`, `frontend/src/routes/*`

---

## Backend (FastAPI)

**Structure**
- `backend/main.py`: App setup, CORS, router registration, `/api/health`.
- `backend/config.py`: Environment-driven settings.
- `backend/dependencies.py`: Auth + header dependencies.
- `backend/routers/`: API endpoints.
- `backend/schemas/`: Pydantic request/response models.
- `backend/services/`: ElevenLabs client, emotion engine, drift simulator, room chat orchestration, compaction.
- `backend/db/`: SQLite connection + repositories.
- `backend/core/exceptions.py`: Exception helpers.

### API Endpoints

**Health**
- `GET /api/health`: Returns `{status, version}`.

**Users** (`backend/routers/users.py`)
- `GET /api/users`: Lists users with agent counts. Response `UsersListResponse`.
- `GET /api/users/{user_id}`: Returns user + accessible agents list.
- `PATCH /api/users/{user_id}/preferences`: Merge JSON preferences. Body `UserPreferencesUpdate`.
- `GET /api/users/{user_id}/agents`: Lists agents for user. Response `AgentsListResponse`.
- `GET /api/users/{user_id}/agents/{agent_id}/sessions`: Lists sessions for user+agent. Response `SessionsListResponse`.

**Agents** (`backend/routers/agents.py`)
- `GET /api/agents/{agent_id}`: Returns agent with owner user IDs; access check via user header.

**Sessions** (`backend/routers/sessions.py`)
- `GET /api/sessions`: Lists sessions for user, optional filter by `X-Agent-Id` header.
- `POST /api/sessions`: Creates session. Body `CreateSessionRequest`.
- `GET /api/sessions/{session_id}`: Returns session details + participants.
- `PATCH /api/sessions/{session_id}`: Rename session. Body `UpdateSessionRequest`.
- `DELETE /api/sessions/{session_id}`: Deletes session. Response `DeleteResponse`.
- `GET /api/sessions/{session_id}/history?limit=`: Returns history for session. Response `SessionHistoryResponse`.

**Rooms (Group Chat)** (`backend/routers/rooms.py`)
- `GET /api/rooms`: Lists rooms for current user. Response `RoomsListResponse`.
- `POST /api/rooms`: Creates room with 1+ agents. Body `CreateRoomRequest`.
- `GET /api/rooms/{room_id}`: Room detail with agent and participant lists. Response `RoomDetailResponse`.
- `PATCH /api/rooms/{room_id}`: Updates room name/settings. Body `UpdateRoomRequest`.
- `DELETE /api/rooms/{room_id}`: Deletes room. Response `DeleteResponse`.
- `GET /api/rooms/{room_id}/agents`: Lists agents in room. Response `RoomAgentListResponse`.
- `POST /api/rooms/{room_id}/agents`: Adds agent. Body `AddRoomAgentRequest`.
- `PATCH /api/rooms/{room_id}/agents/{agent_id}`: Updates agent role/response mode. Body `UpdateRoomAgentRequest`.
- `DELETE /api/rooms/{room_id}/agents/{agent_id}`: Removes agent. Response `DeleteResponse`.
- `GET /api/rooms/{room_id}/history?limit=`: Room message history with sender attribution. Response `RoomHistoryResponse`.
- `POST /api/rooms/{room_id}/chat?stream=0|1`: Multi-agent room chat. Body `RoomChatRequest`.

**Chat / Media** (`backend/routers/chat.py`)
- `POST /api/chat?stream=0|1`: Main chat endpoint.
  - Request: `ChatRequest` (`message`, optional `game_context`).
  - Headers: `Authorization`, `X-User-Id`, `X-Agent-Id`, optional `X-Session-Id`.
  - Logic: builds message list (summary + recent history + emotion context + game context), calls Clawdbot `/v1/chat/completions`, parses behavior tags, stores messages, triggers emotion updates, runs compaction.
  - Non-stream response: `{response, session_id, processing_ms, model, behavior, usage, emotion_debug?}`.
  - Stream response: SSE data chunks plus `event: avatar` and `event: emotion`.
- `POST /api/transcribe`: Multipart audio upload, forwards to STT service, returns transcription JSON.
- `POST /api/speak`: TTS via ElevenLabs REST with alignment data, returns `{audio_base64, alignment, voice_id, duration_estimate}`.

**Memory** (`backend/routers/memory.py`)
- `GET /api/memory?agent_id=`: Returns `MEMORY.md` from agent workspace as `text/markdown`.
- `GET /api/memory/list?agent_id=`: Lists memory files. Response `MemoryFilesResponse`.
- `GET /api/memory/{filename}?agent_id=`: Returns specific memory file. Response `MemoryContentResponse`.

**Admin / Manage** (`backend/routers/admin.py`)
- `GET /api/manage/sessions`: Lists all sessions.
- `DELETE /api/manage/sessions/agent/{agent_id}`: Deletes sessions for agent.
- `DELETE /api/manage/sessions/all`: Deletes all sessions.
- `GET /api/manage/agents`: Lists all agents.
- `PUT /api/manage/agents/{agent_id}`: Updates agent. Body `AgentUpdate`.
- `GET /api/manage/debug/compaction/{session_id}`: Compaction diagnostics.
- `POST /api/manage/debug/compaction/{session_id}/trigger`: Manual compaction.

**Emotion Debug** (`backend/routers/emotional.py`)
- `GET /api/debug/emotional-state/{user_id}/{agent_id}`: Current state + behavior levers + profile.
- `POST /api/debug/emotional-trigger?user_id=&agent_id=&trigger=&intensity=`: Apply trigger.
- `POST /api/debug/emotional-reset/{user_id}/{agent_id}`: Reset emotional state to baseline.
- `GET /api/debug/emotional-timeline/{user_id}/{agent_id}?limit=`: Recent V2 events.
- `POST /api/debug/emotional-decay/{user_id}/{agent_id}?seconds=`: Apply decay.
- `GET /api/debug/calibration/{user_id}/{agent_id}`: Calibration profile for user-agent.

**Designer V2** (`backend/routers/designer_v2.py`)
- `GET /api/designer/v2/personalities`: List agent personality configs.
- `GET /api/designer/v2/personalities/{agent_id}`: Personality detail.
- `PUT /api/designer/v2/personalities/{agent_id}`: Update agent personality (columns + profile JSON).
- `POST /api/designer/v2/personalities/apply`: One-shot apply using `agent_id`/`id` in JSON body (compact response by default, `?full=true` for full object). Optional one-step eval: add `simulate_archetype` query to return `simulation_summary` in same response.
- `GET /api/designer/v2/trigger-defaults`: Default trigger delta map.
- `GET /api/designer/v2/mood-groups`: Mood groups + valence/arousal mapping.
- `GET /api/designer/v2/bonds?agent_id=`: Relationship summaries (user-agent).
- `GET /api/designer/v2/bonds/{user_id}/{agent_id}`: Full bond detail.
- `POST /api/designer/v2/bonds/compare`: Compare multiple user bonds.
- `DELETE /api/designer/v2/bonds/{user_id}/{agent_id}`: Reset bond to baseline.
- `POST /api/designer/v2/personalities/{agent_id}/reset-mood-state`: Reset all users’ mood state for agent.
- `GET /api/designer/v2/calibration/{user_id}/{agent_id}`: Structured calibration view.
- `DELETE /api/designer/v2/calibration/{user_id}/{agent_id}`: Reset all calibration.
- `DELETE /api/designer/v2/calibration/{user_id}/{agent_id}/{trigger_type}`: Reset one trigger.
- `POST /api/designer/v2/simulate`: Dry-run trigger detection + state evolution.
- `GET /api/designer/v2/archetypes`: List available drift user archetypes.
- `POST /api/designer/v2/drift-simulate`: Run a single long-horizon drift simulation.
- `POST /api/designer/v2/drift-simulate-summary`: Run same simulation with compact scorecard output for automation/LLM loops (`config` omitted by default, `?include_config=true` to include).
- `POST /api/designer/v2/drift-compare`: Run side-by-side drift simulations across archetypes.

### Drift API (Used By `/designer-v2` Drift Tab)

Detailed drift endpoint contract is documented in:
- `docs/DRIFT-API.md`

This includes:
- Frontend request flow for the Drift tab
- Exact request bodies for `drift-simulate`, `drift-simulate-summary`, and `drift-compare`
- Backend defaults, validation behavior, and typical errors
- Full and compact response shapes and field notes

### Data Models

**Pydantic requests** (`backend/schemas/requests.py`)
- `ChatRequest`: `{message, game_context?}`
- `CreateSessionRequest`: `{agent_id, name?}`
- `UpdateSessionRequest`: `{name?}`
- `CreateRoomRequest`, `UpdateRoomRequest`, `AddRoomAgentRequest`, `UpdateRoomAgentRequest`, `RoomChatRequest`
- `SpeakRequest`: `{text, voice_id?}`
- `AgentUpdate`: `{display_name?, voice_id?, vrm_model?, workspace?}`
- `UserPreferencesUpdate`: `{preferences: {...}}`

**Pydantic responses** (`backend/schemas/responses.py`)
- `UserResponse`, `AgentResponse`, `SessionResponse`, `SessionHistoryResponse`
- `RoomResponse`, `RoomDetailResponse`, `RoomAgentResponse`, `RoomHistoryResponse`, `RoomChatResponse`
- `ChatResponse`, `TTSResponse`, `TranscriptionResponse`
- `UsersListResponse`, `AgentsListResponse`, `SessionsListResponse`
- `MemoryFilesResponse`, `MemoryContentResponse`, `DeleteResponse`, `AgentDeleteResponse`, `StatusResponse`

### Database Schema (SQLite)

Defined in `backend/db/connection.py` (auto-init + migrations on import).

**Core tables**
- `users`: `id`, `display_name`, `preferences`, `created_at`
- `agents`: `id`, `display_name`, `clawdbot_agent_id`, `vrm_model`, `voice_id`, `workspace`, emotional baselines + profile JSON
- `user_agents`: many-to-many access
- `sessions`: `id`, `agent_id`, `name`, `created_at`, `last_used`, `message_count`, compaction summary fields
- `session_participants`: many-to-many
- `messages`: chat history with LLM metadata and behavior tags
- `rooms`: group-chat container (`created_by`, settings, activity counters, optional summary)
- `room_participants`: many-to-many user membership in rooms
- `room_agents`: many-to-many agent membership + response modes (`mention|always|manual`)
- `room_messages`: group-chat message log with sender attribution and behavior tags
- `tts_cache`: TTS caching data
- `game_stats`: per-session game results

**Emotion engine tables**
- `emotional_state`: persistent state per user-agent, relationship dimensions, calibration JSON
- `emotional_events_v2`: v2 events with outcomes + calibration updates
- `trigger_counts`: trigger novelty tracking
- `moods`: mood definitions (valence/arousal)
- `relationship_types`: relationship archetypes + JSON modifiers

### Dependencies & Config

**Runtime libraries**
- FastAPI, Uvicorn, HTTPX, python-multipart, Transformers, Torch (see `backend/requirements.txt`).

**Environment variables** (`backend/config.py`)
- `CLAWDBOT_TOKEN` (required), `CLAWDBOT_URL`, `STT_SERVICE_URL`.
- `AUTH_TOKEN`, `AUTH_ALLOW_DEV_TOKEN`.
- `ALLOWED_ORIGINS` for CORS.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`.
- `TTS_CACHE_ENABLED`, `TTS_CACHE_TTL_SECONDS`, `TTS_CACHE_MAX_ENTRIES`.
- `CHAT_HISTORY_LIMIT`.
- `COMPACT_THRESHOLD`, `COMPACT_KEEP_RECENT`, `COMPACT_MODEL`.
- `GAMES_V2_AGENT_ALLOWLIST` (optional agent rollout cohort).
- `EMILIA_DB_PATH` / fallback for DB.
- Emotion-engine classifier tuning env vars are read directly in `backend/services/emotion_engine.py`:
  - `TRIGGER_CLASSIFIER_ENABLED`
  - `TRIGGER_CLASSIFIER_CONFIDENCE`

**Auth & Security**
- All endpoints require `Authorization: Bearer {token}` via `verify_token`.
- User/agent/session context via headers: `X-User-Id`, `X-Agent-Id`, `X-Session-Id`.
- Memory endpoint validates user-agent access and path traversal.

### Services & Logic

**Emotion Engine** (`backend/services/emotion_engine.py`)
- Detects triggers with a local GoEmotions classifier (`SamLowe/roberta-base-go_emotions`).
- Normalizes legacy trigger aliases to canonical GoEmotions labels for backward compatibility.
- Maintains emotional state (V/A/D + relationship dimensions + mood weights).
- Supports per-trigger calibration and outcome-driven learning.
- Produces prompt context blocks for injection.

**Compaction** (`backend/services/compaction.py`)
- Summarizes older session history via Clawdbot model; stored in `sessions.summary` and old messages pruned.

**TTS** (`backend/services/elevenlabs.py`)
- ElevenLabs REST `/with-timestamps` for alignment data.
- Caching in SQLite (`tts_cache`).

### Testing

- `backend/tests/`: pytest suite (API, emotion engine, compaction, TTS cache, parsing).
- `backend/scripts/run-tests.sh`: helper runner.

---

## Frontend (React + Vite)

**Structure**
- `frontend/src/App.tsx`: Main chat UI layout.
- `frontend/src/routes/`: TanStack Router file-based routes.
- `frontend/src/components/`: UI and panels.
- `frontend/src/avatar/`: VRM rendering + animation systems.
- `frontend/src/games/`: Game modules and registry.
- `frontend/src/store/`: Zustand stores.
- `frontend/src/utils/`: API wrapper, helpers, schemas.
- `frontend/src/hooks/`: Chat, voice, session, room, game, and logout hooks.
- `frontend/public/`: VRM + animation assets and manifests.

### Routing

Routes are file-based via TanStack Router.
- `/`: `UserSelection`
- `/user/$userId/`: `AgentSelection`
- `/user/$userId/chat/new`: `NewChatPage`
- `/user/$userId/chat/$sessionId`: Main `App` (chat UI)
- `/user/$userId/chat/initializing/$sessionId`: `InitializingPage`
- `/user/$userId/rooms`: Room list + room creation
- `/user/$userId/rooms/$roomId`: Group room chat UI
- `/manage`: `AdminPanel`
- `/debug`: `AvatarDebugPanel`
- `/designer-v2`: `DesignerPageV2`

### State Management (Zustand)

- `frontend/src/store/index.ts`: App state (status, errors, session, TTS, avatar commands).
- `frontend/src/store/userStore.ts`: Current user/agent, persisted to localStorage.
- `frontend/src/store/chatStore.ts`: Messages + streaming content + emotion debug.
- `frontend/src/store/roomStore.ts`: Group room state (room, agents, messages, per-agent streaming chunks).
- `frontend/src/store/renderStore.ts`: Render quality, per-user persisted settings.
- `frontend/src/store/gameStore.ts`: Game session state, persisted to sessionStorage.
- `frontend/src/store/statsStore.ts`: Latency + state logs for debug HUD.
- `ttsEnabled` no longer mirrors localStorage; it is synced from backend `users.preferences`.

### API Integration

`frontend/src/utils/api.ts`
- Adds auth + context headers (`Authorization`, `X-User-Id`, `X-Agent-Id`, `X-Session-Id`).
- SSE streaming via `streamChat()` for `/api/chat?stream=1`.
- Room APIs for `/api/rooms/*` plus room SSE parsing via `streamRoomChat()`.
- Helpers for users, agents, sessions, memory, TTS and history.

### Major Components

**Core UI**
- `AvatarPanel`: VRM renderer mount + controls.
- `ChatPanel`: Chat overlay with message list.
- `InputControls`: Text input, voice toggle, send controls.
- `GamePanel` + `GameSelector`: Game UX and move flow.
- `Drawer`: Sessions list + settings entry points.
- `UserSelection`, `AgentSelection`: Login-like selection flow.

**Debug & Admin**
- `AdminPanel`: Manage agents + sessions via `/api/manage`.
- `DebugPanel`: LLM/voice/emotion debug HUD (latency, state log, errors, compaction, TTS, emotion engine, voice input).
- `AvatarDebugPanel`: VRM rendering + animation debugging tools.

**Designer V2**
- `components/designer/*`: Personality, bonds, calibration, simulation, trigger editors.

### VRM / Animation System

Located in `frontend/src/avatar/`.
- `AvatarRenderer`: Three.js + VRM scene setup, quality presets, post-processing.
- `AnimationController`, `AnimationGraph`, `AnimationStateMachine`: Behavior-driven animation routing.
- `LipSyncEngine`: Uses ElevenLabs alignment data to drive mouth shapes.
- `LookAtSystem`, `IdleRotator`, `IdleMicroBehaviors`, `BlinkController`: Ambient motion.
- `AnimationLibrary` + `AnimationPlayer`: Asset loading and playback.
- `behavior/*`: Behavior planner and mappings from intent/mood/energy.

Assets
- `frontend/public/vrm/`: VRM models.
- `frontend/public/vrm/vrm-manifest.json`: Model list for debug selector.
- `frontend/public/animations/` + `animation-manifest.json`: Animation files and metadata.

### Games System

- Loader manifest: `frontend/src/games/loaders/manifest.ts` (`gameId -> dynamic import`).
- Runtime registry/loader: `frontend/src/games/registry.ts`.
- Module interface: `frontend/src/games/types.ts`.
- Current modules: `frontend/src/games/modules/tic-tac-toe/`, `frontend/src/games/modules/chess/`.
- Backend catalog APIs: `GET /api/games/catalog`, `GET /api/games/catalog/{game_id}`.
- Manage APIs: `/api/manage/games` + `/api/manage/agents/{agent_id}/games/{game_id}`.
- Selector behavior: only games present in backend catalog *and* frontend loader manifest are shown (`GameSelector` filters via `hasGameLoader`).
- Game context is injected into LLM prompt through `game_context` in `/api/chat`.

**Add-a-game flow**
1. Implement frontend module package under `frontend/src/games/modules/<game-id>/`.
2. Add `<game-id>` to `frontend/src/games/loaders/manifest.ts`.
3. Register metadata via `/manage` Games tab (or `/api/manage/games`) using matching IDs.
4. Enable per-agent config in `/manage`.
5. Confirm rollout flags/allowlists include the target agent.

### Voice Pipeline

- `VoiceService` + `VoiceActivityDetector` orchestrate hands-free VAD + STT.
- `useVoiceChat` hook wires VAD, STT, and chat send.
- `useChat` handles SSE, avatar commands, and optional TTS playback + lip sync.

### Styling / UI

- Tailwind v4 + Radix UI components.
- CSS entry: `frontend/src/index.css`.
- Utility helpers: `frontend/src/lib/utils.ts` and shadcn-style UI wrappers in `frontend/src/components/ui/`.

### Build / Dev

- Vite config: `frontend/vite.config.ts`.
- HTTPS dev server on `:3443` using `certs/selfsigned.*`.
- Proxy `/api` → `http://localhost:8080` in dev.
- Static copy of VAD/ONNX assets via `vite-plugin-static-copy`.

### Frontend Testing

- Vitest config: `frontend/vitest.config.ts`.
- Tests in `frontend/src/**/*.test.ts(x)`.

---

## Integration & Data Flows

**Chat Flow**
- Frontend `useChat` → `streamChat()` → `POST /api/chat?stream=1`.
- Backend builds context: summary + recent DB messages + emotion context + game context.
- Backend calls Clawdbot gateway `/v1/chat/completions` with `model: agent:{clawdbot_agent_id}`.
- Backend parses `[MOOD]`, `[INTENT]`, `[ENERGY]`, `[MOVE]`, `[GAME]` tags for avatar behavior.
- SSE emits text chunks + `avatar` events + `emotion` events.

**Emotion Flow**
- Pre-LLM: load state, decay, detect triggers, apply deltas, generate context block.
- Post-LLM: apply behavior-driven changes, infer outcomes, update calibration + relationship dimensions, log event.

**TTS + Lip Sync**
- `POST /api/speak` returns audio + alignment.
- Frontend decodes audio, starts playback, and passes alignment to `LipSyncEngine`.

**Voice Input (Hands-free)**
- VAD records audio → `POST /api/transcribe` → transcript → `sendMessage()`.

**Memory Access**
- Memory modal reads `MEMORY.md` and `memory/*.md` from agent workspace via backend.

---

## Scripts & Tooling

**Root scripts**
- `scripts/dev.sh`, `scripts/dev-backend.sh`, `scripts/dev-frontend.sh`: dev start helpers.
- `scripts/check-frontend.sh`, `scripts/check-backend.sh`, `scripts/check-all.sh`: test/lint/build flows.
- `scripts/test-scenarios.sh`, `scripts/test-dialogues.py`, `scripts/test-emotion-scenarios.py`: scenario testing.

**Docker**
- `docker-compose.yml`: backend service with host networking, mounts `.openclaw/agents`, DB volume.
- `backend/Dockerfile`: backend container.
- `nginx.conf`: HTTPS + proxy config for `/api`.

---

## Known Patterns / Conventions

- API calls use `fetchWithAuth()` and header-based context IDs.
- Chat responses embed avatar tags parsed by `backend/parse_chat.py` and stripped on frontend.
- Emotion engine updates are serialized per `(user_id, agent_id)` via lock-protected sections in `chat.py` (5s timeout + warning on contention).
- Session compaction is best-effort and run in background.
- Zustand stores are the single source of truth for UI state; React Query is used for server state in some components.

---

## Existing Docs

**Docs present**
- `docs/animation/*`: VRM/animation research and pipeline notes.
- `docs/archive/*`: older plans/specs and previous API docs.
- `docs/planning/*`: implementation plans for game modules and emotion engine.

---

## File Index (Quick Reference)

- `backend/main.py`: app entry + router registration.
- `backend/routers/`: API surface.
- `backend/services/emotion_engine.py`: core emotion engine.
- `backend/db/connection.py`: schema + migrations.
- `frontend/src/App.tsx`: main chat UI.
- `frontend/src/avatar/AvatarRenderer.ts`: VRM renderer.
- `frontend/src/utils/api.ts`: API client + SSE.
- `frontend/src/routes/*`: routing map.
- `frontend/public/vrm/vrm-manifest.json`: VRM model list.
- `frontend/public/animations/animation-manifest.json`: animation list.
