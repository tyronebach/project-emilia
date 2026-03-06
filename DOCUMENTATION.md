# Emilia Web App — LLM Agent Documentation

**Purpose**: Trusted household LLM avatar chat app with VRM rendering, games, emotion engine, and extensive debug tools. Backend supports mixed LLM routing per agent (`openclaw` gateway mode or direct OpenAI-compatible mode).

**Primary Systems**
- VRM viewer + animation system (Three.js + VRM + animation graph, lip sync, post-processing).
- LLM chat interface + game extensions (prompt injection + move parsing).
- LLM-driven emotion engine (state persistence, trigger detection, calibration).
- Soul Window relationship visibility (mood snapshot, bond state, SOUL profile parsing, timeline events).
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

## Agent Workspace & Persona Setup

Emilia agents are defined by their **Workspace**, which contains their personality (`SOUL.md`) and long-term memory (`MEMORY.md`).

### 1. Directory Structure
All agent workspaces should be kept in the root `agents/` directory of this project. This directory is mapped into the Docker container at `/app/agents`.

Example structure:
```text
project-emilia/
├── agents/
│   ├── my-agent/
│   │   ├── SOUL.md       # Identity, Archetype, Rules
│   │   ├── MEMORY.md     # Long-term curated memory
│   │   └── memory/       # Daily journal files
```

### 2. Workflow: Creating a New Agent
To create a new agent from scratch:

1. **Initialize the Workspace:**
   Run the CLI to generate the template files on your host machine:
   ```bash
   python3 cli/emilia.py workspace init agents/my-buddy --name "Buddy"
   ```

2. **Register with the Backend:**
   Tell the backend where to find these files *inside* the container:
   ```bash
   python3 cli/emilia.py agents create --id my-buddy --name "Buddy" --workspace /app/agents/my-buddy --provider native --model gpt-4o-mini
   ```

3. **Grant Access:**
   Map the agent to your user:
   ```bash
   python3 cli/emilia.py users map cli-user my-buddy
   ```

### 3. Editing Personas
You can edit `SOUL.md` or `MEMORY.md` at any time on your host machine. The backend will automatically pick up changes to `SOUL.md` on the next chat turn and will re-index `MEMORY.md` whenever the agent performs a memory search.

---

## Backend (FastAPI)

**Structure**
- `backend/main.py`: App setup, CORS, router registration, `/api/health`.
- `backend/config.py`: Environment-driven settings.
- `backend/dependencies.py`: Auth + header dependencies.
- `backend/routers/`: API endpoints.
- `backend/schemas/`: Pydantic request/response models.
- `backend/services/`: ElevenLabs client, emotion engine, shared emotion runtime hooks, shared chat-context runtime helpers, background task scheduler, room chat orchestration/runtime pipeline, compaction v2, Soul Window helpers, SOUL simulator helpers, direct LLM client, direct tool runtime, memory bridge, top-of-mind memory recall, optional memory auto-capture, dream runtime/scheduler, extracted LLM caller, extracted room chat stream SSE, observability helpers. (Legacy drift simulator remains as deprecated diagnostic code path only.)
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
- `GET /api/users/{user_id}/agents/{agent_id}/rooms`: Lists rooms for user+agent. Response `RoomsListResponse`.

**Agents** (`backend/routers/agents.py`)
- `GET /api/agents/{agent_id}`: Returns agent with owner user IDs; access check via user header.

**Rooms** (`backend/routers/rooms.py`)
- `GET /api/rooms?agent_id=`: Lists rooms for current user, optionally filtered by agent. Response `RoomsListResponse`.
- `POST /api/rooms`: Creates room with 1+ agents. Auto-detects `room_type` (`dm` for 1 agent, `group` for 2+). Body `CreateRoomRequest`.
- `GET /api/rooms/{room_id}`: Room detail with agent and participant lists. Response `RoomDetailResponse`.
- `PATCH /api/rooms/{room_id}`: Updates room name/settings. Body `UpdateRoomRequest`.
- `DELETE /api/rooms/{room_id}`: Deletes room. Response `DeleteResponse`.
- `GET /api/rooms/{room_id}/agents`: Lists agents in room. Response `RoomAgentListResponse`.
- `POST /api/rooms/{room_id}/agents`: Adds agent. Body `AddRoomAgentRequest`.
- `PATCH /api/rooms/{room_id}/agents/{agent_id}`: Updates agent role/response mode. Body `UpdateRoomAgentRequest`.
- `DELETE /api/rooms/{room_id}/agents/{agent_id}`: Removes agent. Response `DeleteResponse`.
- `GET /api/rooms/{room_id}/history?limit=`: Room message history with sender attribution. Response `RoomHistoryResponse`.
- `POST /api/rooms/{room_id}/chat?stream=0|1`: Multi-agent room chat. Body `RoomChatRequest`.
  - Request fields mirror core chat semantics:
    - `message`
    - optional `game_context` (validated `GameContextRequest`)
    - optional `runtime_trigger` / `runtimeTrigger` (marks runtime-origin turns)
  - Per responding agent, routing uses persisted `agents.chat_mode`:
    - `openclaw`: `agent:{clawdbot_agent_id}` via gateway
    - `direct`: OpenAI-compatible `/chat/completions` (with optional per-agent model/base overrides)
  - Stream response emits additive room events: `agent_start`, `agent_done`, `agent_error`, `avatar`, `emotion`.

**Chat / Media** (`backend/routers/chat.py`)
- `POST /api/chat?stream=0|1`: DM chat facade — uses explicit `room_id` if provided, otherwise resolves via `get_or_create_dm_room()`, and delegates to the room chat pipeline.
  - Request: `ChatRequest` (`message`, optional `room_id`, optional `game_context`, optional `runtime_trigger`).
  - Headers: `Authorization`, `X-User-Id`, `X-Agent-Id`.
  - Internally stores the user message in `room_messages`, then calls `_call_llm_non_stream` (non-stream) or wraps `_stream_room_chat_sse` in `_dm_stream_wrapper` (stream). The wrapper strips agent attribution from SSE events to preserve the legacy single-agent contract.
  - Non-stream response: `{response, room_id, processing_ms, model, behavior, usage, emotion_debug?}`.
  - Stream response: SSE data chunks plus `event: avatar` and `event: emotion` (`emotion.snapshot` carries structured mood telemetry for UI).
  - On LLM failure, user-message rollback semantics are preserved (orphaned user message cleanup).
- `POST /api/transcribe`: Multipart audio upload, forwards to STT service, returns transcription JSON.
- `POST /api/speak`: TTS via ElevenLabs REST with alignment data, returns `{audio_base64, alignment, voice_id, duration_estimate}`.

**Memory** (`backend/routers/memory.py`)
- `GET /api/memory?agent_id=`: Returns `MEMORY.md` from agent workspace as `text/markdown`.
- `GET /api/memory/list?agent_id=`: Lists memory files. Response `MemoryFilesResponse`.
- `GET /api/memory/{filename}?agent_id=`: Returns specific memory file. Response `MemoryContentResponse`.

**Soul Window** (`backend/routers/soul_window.py`)
- `GET /api/soul-window/mood`: User-scoped mood snapshot (dominant mood, secondaries, trust/intimacy, valence/arousal).
- `GET /api/soul-window/bond`: User-scoped relationship snapshot (dimensions, labels, inferred relationship type, milestones).
- `GET /api/soul-window/about`: Parsed `SOUL.md` sections from agent workspace.
- `GET /api/soul-window/events`: Workspace-backed timeline (`{workspace}/user_data/{user_id}/events.json`).
- `POST /api/soul-window/events`: Idempotent timeline mutations (`add_milestone`, `add_event`, `remove_event`).

**Admin / Manage** (`backend/routers/admin.py`)
- `DELETE /api/manage/rooms/all`: Deletes all rooms.
- `GET /api/manage/agents`: Lists all agents.
- `POST /api/manage/agents`: Creates agent. Body `AgentCreate`.
- `PUT /api/manage/agents/{agent_id}`: Updates agent. Body `AgentUpdate`.
- `DELETE /api/manage/agents/{agent_id}`: Deletes agent + related rooms, messages, emotional data.
- `GET /api/manage/debug/compaction/{room_id}`: Compaction diagnostics for a room.
- `POST /api/manage/debug/compaction/{room_id}/trigger`: Manual compaction for a room.

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
- `POST /api/designer/v2/personalities/apply`: One-shot apply using `agent_id`/`id` in JSON body (compact response by default, `?full=true` for full object).
- `GET /api/designer/v2/trigger-defaults`: Default trigger delta map.
- `GET /api/designer/v2/mood-groups`: Mood groups + valence/arousal mapping.
- `GET /api/designer/v2/mood-injection-settings`: Read global mood injection settings.
- `PUT /api/designer/v2/mood-injection-settings`: Update global mood injection settings.
- `GET /api/designer/v2/bonds?agent_id=`: Relationship summaries (user-agent).
- `GET /api/designer/v2/bonds/{user_id}/{agent_id}`: Full bond detail.
- `POST /api/designer/v2/bonds/compare`: Compare multiple user bonds.
- `DELETE /api/designer/v2/bonds/{user_id}/{agent_id}`: Reset bond to baseline.
- `POST /api/designer/v2/personalities/{agent_id}/reset-mood-state`: Reset all users’ mood state for agent.
- `GET /api/designer/v2/calibration/{user_id}/{agent_id}`: Structured calibration view.
- `DELETE /api/designer/v2/calibration/{user_id}/{agent_id}`: Reset all calibration.
- `DELETE /api/designer/v2/calibration/{user_id}/{agent_id}/{trigger_type}`: Reset one trigger.
- `POST /api/designer/v2/simulate`: Dry-run trigger detection + state evolution.
- `POST /api/designer/v2/soul/simulate`: Multi-turn SOUL persona simulation + judge analysis (stateless; for tuning).
- `GET /api/designer/v2/archetypes`: List global drift archetypes (DB-backed replay datasets).
- `GET /api/designer/v2/archetypes/{archetype_id}`: Fetch one archetype (full replay payload).
- `POST /api/designer/v2/archetypes`: Create archetype from explicit `message_triggers`.
- `POST /api/designer/v2/archetypes/generate`: Generate archetype from uploaded UTF-8 text file.
- `PUT /api/designer/v2/archetypes/{archetype_id}`: Update archetype metadata/replay data.
- `DELETE /api/designer/v2/archetypes/{archetype_id}`: Delete archetype.
- `POST /api/designer/v2/drift-simulate`: **Deprecated** (`410 Gone`) — use `/api/dreams` for climate evolution.
- `POST /api/designer/v2/drift-simulate-summary`: **Deprecated** (`410 Gone`) — use `/api/dreams` for climate evolution.
- `POST /api/designer/v2/drift-compare`: **Deprecated** (`410 Gone`) — use `/api/dreams` for climate evolution.

### Drift API (Used By `/designer-v2` Drift Tab)

Detailed drift endpoint contract is documented in:
- `docs/planning/archive/DRIFT-API.md`

This includes:
- Frontend request flow for the Drift tab
- Exact request bodies for `drift-simulate`, `drift-simulate-summary`, and `drift-compare`
- Archetype CRUD + generate contract (`/archetypes*`)
- Replay mode behavior (`sequential` vs `random`) and one-step apply simulation knobs
- Backend defaults, validation behavior, and typical errors
- Full and compact response shapes and field notes

### Data Models

**Pydantic requests** (`backend/schemas/requests.py`)
- `ChatRequest`: `{message, room_id?, game_context?, runtime_trigger?}`
- `CreateRoomRequest` (with optional `room_type`), `UpdateRoomRequest`, `AddRoomAgentRequest`, `UpdateRoomAgentRequest`, `RoomChatRequest`
  - `RoomChatRequest`: `{message, mention_agents?, game_context?, runtime_trigger?}`
- `SpeakRequest`: `{text, voice_id?}`
- `AgentCreate`: `{id, display_name, clawdbot_agent_id, vrm_model?, voice_id?, workspace?, chat_mode?, direct_model?, direct_api_base?}`
- `AgentUpdate`: `{display_name?, voice_id?, vrm_model?, workspace?, chat_mode?, direct_model?, direct_api_base?}`
- `UserPreferencesUpdate`: `{preferences: {...}}`
- `SoulWindowEventsRequest`: `{action, id?, item?}`

**Pydantic responses** (`backend/schemas/responses.py`)
- `UserResponse`, `AgentResponse`
- `RoomResponse`, `RoomDetailResponse`, `RoomAgentResponse`, `RoomHistoryResponse`, `RoomChatResponse`
- `ChatResponse`, `TTSResponse`, `TranscriptionResponse`
- `UsersListResponse`, `AgentsListResponse`, `RoomsListResponse`
- `MemoryFilesResponse`, `MemoryContentResponse`, `DeleteResponse`, `AgentDeleteResponse`, `StatusResponse`

### Database Schema (SQLite)

Defined in `backend/db/connection.py` (auto-init + migrations on import).

**Core tables**
- `users`: `id`, `display_name`, `preferences`, `created_at`
- `agents`: `id`, `display_name`, `clawdbot_agent_id`, `vrm_model`, `voice_id`, `workspace`, `chat_mode`, `direct_model`, `direct_api_base`, emotional baselines + profile JSON
- `user_agents`: many-to-many access
- `rooms`: canonical chat container (`room_type` = `dm` or `group`, `created_by`, settings, activity counters, optional compaction summary)
- `room_participants`: many-to-many user membership in rooms
- `room_agents`: many-to-many agent membership + response modes (`mention|always|manual`)
- `room_messages`: chat message log with sender attribution (`sender_type`: `user`|`agent`, `sender_id`) and behavior tags. Frontend `ChatMessage` also supports `sender_type: 'system'` for local error messages.
- `tts_cache`: TTS caching data
- `game_stats`: per-room game results (`room_id` FK to rooms)
- `drift_archetypes`: global drift replay datasets used by Designer V2 simulation

**Emotion engine tables**
- `emotional_state`: persistent state per user-agent, relationship dimensions, calibration JSON
- `emotional_events_v2`: v2 events with outcomes + calibration updates
- `trigger_counts`: trigger novelty tracking
- `moods`: mood definitions (valence/arousal)
- `relationship_types`: relationship archetypes + JSON modifiers

### Dependencies & Config

**Runtime libraries**
- FastAPI, Uvicorn, HTTPX, python-multipart, Transformers, Torch, sqlite-vec (see `backend/requirements.txt`).

**Environment variables** (`backend/config.py`)
- `CLAWDBOT_TOKEN` (required), `CLAWDBOT_URL`, `STT_SERVICE_URL`.
- `AUTH_TOKEN`, `AUTH_ALLOW_DEV_TOKEN`.
- `ALLOWED_ORIGINS` for CORS.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`.
- `TTS_CACHE_ENABLED`, `TTS_CACHE_TTL_SECONDS`, `TTS_CACHE_MAX_ENTRIES`.
- `CHAT_HISTORY_LIMIT`.
- `COMPACT_THRESHOLD`, `COMPACT_KEEP_RECENT`, `COMPACT_MODEL`.
- `COMPACTION_PERSONA_MODE`, `COMPACTION_TEXTURE_MAX_LINES`, `COMPACTION_OPEN_THREADS_MAX`.
- `SOUL_SIM_PERSONA_MODEL`, `SOUL_SIM_MAX_TURNS`.
- `OPENAI_API_KEY`, `OPENAI_API_BASE`, `DIRECT_DEFAULT_MODEL` (used when agent `chat_mode=direct`).
- `OPENCLAW_GATEWAY_URL`, `DIRECT_TOOL_MAX_STEPS`, `GEMINI_API_KEY`.
- `GAMES_V2_AGENT_ALLOWLIST` (optional agent rollout cohort).
- `MEMORY_AUTORECALL_ENABLED`, `MEMORY_AUTORECALL_SCORE_THRESHOLD`, `MEMORY_AUTORECALL_MAX_ITEMS`, `MEMORY_AUTORECALL_MAX_CHARS`, `MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED`.
- `MEMORY_AUTOCAPTURE_ENABLED`, `MEMORY_AUTOCAPTURE_MODEL`, `MEMORY_AUTOCAPTURE_TIMEOUT_S`, `MEMORY_AUTOCAPTURE_MAX_CANDIDATES`, `MEMORY_AUTOCAPTURE_MAX_ITEMS_PER_DAY`, `MEMORY_AUTOCAPTURE_MIN_CONFIDENCE`.
- `DREAM_CONTEXT_MAX_MESSAGES`, `DREAM_INCLUDE_ROOM_SUMMARY`, `DREAM_INCLUDE_MEMORY_HITS`, `DREAM_MEMORY_HITS_MAX`, `DREAM_LIVED_EXPERIENCE_MAX_CHARS`, `DREAM_NEGATIVE_EVENT_COOLDOWN_HOURS`.
- `EMOTION_TRIGGER_CALIBRATION_ENABLED` (per-user calibration on/off).
- `EMOTION_SESSION_REANCHOR_MODE`, `EMOTION_REANCHOR_ALPHA_SHORT_GAP`, `EMOTION_REANCHOR_ALPHA_LONG_GAP`, `EMOTION_REANCHOR_LONG_GAP_HOURS` are retained for compatibility but deprecated in the active runtime path after P013 weather reset.
- `EMILIA_DB_PATH` / fallback for DB.
- Emotion-engine classifier tuning env vars are surfaced via `backend/config.py` and consumed by runtime/services:
  - `TRIGGER_CLASSIFIER_ENABLED`
  - `TRIGGER_CLASSIFIER_CONFIDENCE`
  - `SARCASM_MITIGATION_ENABLED`
  - `SARCASM_POSITIVE_DAMPEN_FACTOR`
  - `SARCASM_RECENT_NEGATIVE_DAMPEN_FACTOR`
  - `SARCASM_RECENT_POSITIVE_THRESHOLD`
- Classifier sarcasm phrase tuning env vars are read in `backend/services/trigger_classifier.py`:
  - `SARCASM_EXACT_BOOST`
  - `SARCASM_CONTAINS_BOOST`
  - `SARCASM_POSITIVE_CAP`

**Auth & Security**
- All endpoints require `Authorization: Bearer {token}` via `verify_token`.
- User/agent context via headers: `X-User-Id`, `X-Agent-Id`.
- Memory endpoint validates user-agent access and path traversal.

### Services & Logic

**Emotion Engine** (`backend/services/emotion_engine.py`)
- Detects triggers with a local GoEmotions classifier (`SamLowe/roberta-base-go_emotions`).
- Normalizes legacy trigger aliases to canonical GoEmotions labels for backward compatibility.
- Applies sarcasm-aware co-occurrence dampening when positive signals conflict with negative/recent-negative context.
- Maintains emotional state (V/A/D + relationship dimensions + mood weights).
- Supports per-trigger calibration and outcome-driven learning.
- Produces prompt context blocks for injection.

**Shared Chat Runtime Helpers** (`backend/services/chat_context_runtime.py`, `backend/services/emotion_runtime.py`, `backend/services/background_tasks.py`)
- `chat_context_runtime.py`: shared prompt/context helpers used by both `chat.py` and `rooms.py` (game context injection, first-turn facts, trusted game prompt resolution, milestone helper, mood snapshot helper).
- `emotion_runtime.py`: shared pre/post LLM emotion hooks + per-user-agent lock management.
- `background_tasks.py`: shared background task scheduler with retained task references.

**Compaction** (`backend/services/compaction.py`)
- Summarizes older room history via direct OpenAI-compatible call (`COMPACT_MODEL`), stores in `rooms.summary`, and prunes old messages.
- Supports persona-aware compaction (`off`, `dm_only`, `all`) with structured output validation and neutral fallback.

**Dream Runtime** (`backend/services/dreams/runtime.py`)
- Uses blended context (recent interactions + optional room summaries + optional memory hits + lived experience).
- Applies bounded relationship deltas plus anti-rumination cooldown guard.
- Persists context/safety metadata to `dream_log` for auditability.

**SOUL Simulator** (`backend/services/soul_simulator.py`)
- Runs a ping-pong exchange (archetype user vs SOUL persona) and returns judge-scored consistency hints.
- Used by `POST /api/designer/v2/soul/simulate`.

**LLM Caller** (`backend/services/llm_caller.py`)
- Extracted from `rooms.py`. Provides `call_llm_streaming()` async generator for both `direct` and `openclaw` modes.
- Yields `{"content": str}` chunks or `{"done": True, "usage": dict}` terminal event.
- Used by both streaming and non-streaming room chat paths.

**Room Chat Stream** (`backend/services/room_chat_stream.py`)
- Extracted `_stream_room_chat_sse` and helpers (`_extract_behavior_dict`, `_room_message_row`, `_maybe_compact_room`) from `rooms.py`.
- Both `rooms.py` and `chat.py` import at module level — eliminates the previous fragile late import circular dependency.

**Direct LLM + Tool Runtime** (`backend/services/direct_llm.py`, `backend/services/direct_tool_runtime.py`)
- `DirectLLMClient`: OpenAI-compatible chat completion (non-stream + stream), with optional `tools` param.
- `normalize_messages_for_direct()`: shared message normalization used by both `chat.py` and `rooms.py`.
- `run_tool_loop()`: bounded tool loop (max steps configurable via `DIRECT_TOOL_MAX_STEPS`) that calls `chat_completion` with `MEMORY_TOOLS`, executes tool calls via memory bridge, and returns final content.

**Memory Recall & Capture** (`backend/services/memory/top_of_mind.py`, `backend/services/memory/auto_capture.py`)
- Top-of-mind recollection injection is threshold/budget-gated and inserted as a compact system block before latest user turn.
- Optional backend auto-capture extracts candidate continuity facts (preferences/commitments/date-like notes) with dedupe and daily limits.

**Memory Bridge** (`backend/services/memory_bridge.py`)
- Reads OpenClaw's SQLite memory index directly (`~/.openclaw/memory/<claw_agent_id>.sqlite`).
- Hybrid search: vector similarity via `sqlite-vec` (cosine distance) + FTS5 BM25, weighted merge (0.7/0.3). Falls back to FTS-only when vector search unavailable.
- Gemini embedding API for query vectors (`gemini-embedding-001`).
- File read/write for `MEMORY.md` and `memory/*.md` with path validation (rejects traversal).

**TTS** (`backend/services/elevenlabs.py`)
- ElevenLabs REST `/with-timestamps` for alignment data.
- Caching in SQLite (`tts_cache`).

### Testing

- `backend/tests/`: pytest suite (API, emotion engine, compaction, TTS cache, parsing).
- Latest backend baseline: `372 passed` from `python3 -m pytest -q` in `backend/`.
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
- `frontend/src/types/soulWindow.ts`: Soul Window API payload types.
- `frontend/src/hooks/`: Unified chat (`useChat`), voice, game, session, and logout hooks.
- `frontend/public/`: VRM + animation assets and manifests.

### Routing

Routes are file-based via TanStack Router.
- `/`: `UserSelection`
- `/user/$userId/`: `AgentSelection`
- `/user/$userId/chat/new`: `NewChatPage` (creates a room)
- `/user/$userId/chat/$roomId`: Main `App` (chat UI — handles both 1:1 and multi-agent rooms)
- `/user/$userId/chat/initializing/$roomId`: `InitializingPage`
- `/manage`: `AdminPanel`
- `/debug`: `AvatarDebugPanel`
- `/designer-v2`: `DesignerPageV2`

### State Management (Zustand)

- `frontend/src/store/index.ts`: App state (status, errors, roomId, TTS, avatar commands).
- `frontend/src/store/userStore.ts`: Current user/agent, persisted to localStorage. `setAgent()` clears room state (for agent switch navigation). `syncAgent()` updates identity only (for post-removal sync without clearing messages/room).
- `frontend/src/store/chatStore.ts`: Unified chat + room state. Holds messages (`ChatMessage[]`), room context (`currentRoom`, `agents`), per-agent maps (`streamingByAgent`, `statusByAgent`, `emotionByAgent`, `avatarCommandByAgent`, `lastAvatarEventAtByAgent`), emotion debug, `currentMood` snapshot, and `focusedAgentId`. Replaces the former separate `roomStore`.
- `frontend/src/store/renderStore.ts`: Render quality, per-user persisted settings. Per-agent camera positions via `cameraPositionByAgent` map (scoped by agentId, persisted to localStorage).
- `frontend/src/store/gameStore.ts`: Game session state, persisted to sessionStorage.
- `frontend/src/store/statsStore.ts`: Latency + state logs for debug HUD.
- `ttsEnabled` no longer mirrors localStorage; it is synced from backend `users.preferences`.

### API Integration

`frontend/src/utils/api.ts`
- Adds auth + context headers (`Authorization`, `X-User-Id`, `X-Agent-Id`).
- SSE streaming via `streamChat()` for `/api/chat?stream=1`.
- Room APIs for `/api/rooms/*` plus room SSE parsing via `streamRoomChat()`.
- Helpers for users, agents, rooms, memory, TTS and history.
- `EmotionDebug` includes optional structured `snapshot` payload from backend `event: emotion`.

`frontend/src/utils/soulWindowApi.ts`
- Wrappers for `/api/soul-window/{mood,bond,about,events}`.

### Major Components

**Core UI**
- `AvatarPanel`: Single-agent full-screen VRM renderer mount + orbit controls.
- `AvatarStage`: Multi-agent avatar grid layout (1=full, 2=side-by-side, 3-4=2x2). Uses `RoomAvatarTile` per agent.
- `ChatPanel`: Chat overlay with message list.
- `InputControls`: Text input, voice toggle, send controls.
- `components/rooms/RoomAvatarTile`: Per-agent VRM tile renderer with independent orbit controls, per-agent camera persistence, and `AvatarRendererRegistry` integration.
- `ParticipantsDrawer`: Right-side drawer for viewing/adding/removing room participants. DM→group promotion with confirmation dialog.
- `GamePanel` + `GameSelector`: Game UX and move flow. Games only render in single-agent (DM) mode; hidden in multi-agent rooms.
- `Drawer`: Room (chat) list + settings entry points.
- `Header` + `MoodIndicator`: status + current mood display + participants button with agent count badge.
- `BondModal` + `AboutModal`: Soul Window relationship/personality modals.
- `UserSelection`, `AgentSelection`: Login-like selection flow.

**Debug & Admin**
- `AdminPanel`: Manage agents + rooms via `/api/manage`.
- `DebugPanel`: LLM/voice/emotion debug HUD (latency, state log, errors, compaction, TTS, emotion engine, voice input).
- `AvatarDebugPanel`: VRM rendering + animation debugging tools.

**Designer V2**
- `components/designer/*`: Personality, bonds, calibration, drift simulation, archetype management, trigger editors.

### VRM / Animation System

Located in `frontend/src/avatar/`.
- `AvatarRenderer`: Three.js + VRM scene setup, quality presets, post-processing. Accepts optional `agentId` for per-agent camera position persistence (saves/loads via `renderStore.cameraPositionByAgent` instead of global position).
- `AvatarRendererRegistry`: Singleton registry for per-agent renderer lookup (room mode). `RoomAvatarTile` registers renderers on VRM load; `useChat` uses the registry for per-agent lip-sync routing.
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
- In room (multi-agent) mode, TTS plays agents sequentially with per-agent `voice_id` override.
- Lip-sync routes through `AvatarRendererRegistry` for per-agent renderer targeting in room mode, falling back to the global `avatarRenderer` in DM mode.

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
- Frontend `useChat('dm')` → `streamChat()` → `POST /api/chat?stream=1` (with `room_id` from store).
- Frontend `useChat('room')` → `streamRoomChat()` → `POST /api/rooms/{roomId}/chat?stream=1`.
- The unified `useChat` hook auto-detects mode from `chatStore.agents.length` if not specified.
- Backend uses provided `room_id` if present, otherwise resolves DM room via `get_or_create_dm_room()`, then delegates to room chat pipeline.
- Room pipeline builds context: summary + recent `room_messages` + emotion context + first-turn timezone-aware facts + game context.
- LLM calling extracted to `backend/services/llm_caller.py`; SSE framing extracted to `backend/services/room_chat_stream.py`.
- LLM routing by `agents.chat_mode`:
  - `openclaw`: Clawdbot gateway `/v1/chat/completions` with `model: agent:{clawdbot_agent_id}`.
  - `direct`: `run_tool_loop()` with memory tools → OpenAI-compatible `/chat/completions`. Tool loop runs non-stream; final content emitted as single SSE chunk.
- Backend parses `[MOOD]`, `[INTENT]`, `[ENERGY]`, `[MOVE]`, `[GAME]` tags for avatar behavior.
- `_dm_stream_wrapper` reshapes room SSE events to legacy single-agent format (strips agent_id, converts `agent_done` → `done`).
- SSE emits text chunks + `avatar` events + `emotion` events.
- Room-mode streaming content is wrapped in `stripAvatarTagsStreaming()` before display (same as DM mode).
- `emotion` event includes optional `snapshot` used by frontend mood indicator + bond modal entry.
- Room-mode avatar events update `chatStore.avatarCommandByAgent` for ALL agents (no `focusedAgentId` gating). Each `RoomAvatarTile` reactively picks up its own command. Avatar `move` events are routed through `handleAvatarResponse()` for game move parsing in both DM and room modes.
- Room-mode TTS: sequential per-agent queue drains after streaming. Each agent's `voice_id` is used; lip-sync routes through `AvatarRendererRegistry`.
- Room-mode game context: `sendRoomMessage()` calls `getGameContext()` and passes it to `streamRoomChat()` (same as DM path). Games UI (`GamePanel`) is only rendered in single-agent mode.
- Room error messages use `sender_type: 'system'` (not `'agent'`) for both per-agent errors and stream-level errors.
- Failed agent responses show a "Retry" button that re-sends only to the failed agent.

**Soul Window Flow**
- Header mood indicator reflects `chatStore.currentMood` from SSE `emotion.snapshot`.
- Bond/About modals load from `/api/soul-window/bond` and `/api/soul-window/about`.
- Events timeline reads/writes via `/api/soul-window/events`.
- Workspace events file is `{workspace}/user_data/{user_id}/events.json` with atomic writes and idempotent IDs.

**Emotion Flow**
- Pre-LLM: load state, decay, detect triggers, apply deltas, generate context block.
- Post-LLM: apply behavior-driven changes, infer outcomes, update calibration + relationship dimensions, log event.

**TTS + Lip Sync**
- `POST /api/speak` returns audio + alignment.
- DM: Frontend decodes audio, starts playback, and passes alignment to global `avatarRenderer.lipSyncEngine`.
- Room: `speakText(text, voiceId, agentId)` looks up the agent's renderer via `AvatarRendererRegistry` for per-agent lip-sync, falling back to the global renderer.

**Voice Input (Hands-free)**
- VAD records audio → `POST /api/transcribe` → transcript → `sendMessage()`.

**Memory Access**
- Memory modal reads `MEMORY.md` and `memory/*.md` from agent workspace via backend.
- Direct-mode agents access memory via tool loop: `memory_search` (hybrid vector+FTS), `memory_read`, `memory_write` — all reading/writing agent workspace files through `memory_bridge.py`.

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
- Emotion engine updates are serialized per `(user_id, agent_id)` in `backend/services/emotion_runtime.py` (5s timeout + warning on contention).
- First non-runtime turn context facts use configured timezone (`DEFAULT_TIMEZONE`; UTC fallback) in `backend/services/chat_context_runtime.py`.
- Soul Window events are file-backed and supplemental; relationship dimensions remain canonical in DB.
- Room compaction is best-effort and run in background.
- Zustand stores are the single source of truth for UI state; React Query is used for server state in some components.

---

## Existing Docs

**Docs present**
- `docs/AUDIT-CHAT-2026-02-18.md`: Chat system architectural audit (current).
- `docs/PLAN-CHAT-IMPL-2026-02-18.md`: Unified chat implementation plan (6 phases, all completed).
- `docs/GLOBAL-DYNAMICS-TUNING.md`: Global Dynamics mood injection tuning guide (knobs, presets, per-agent vs global).
- `docs/SOUL-SIMULATOR-API.md`: SOUL simulator endpoint contract.
- `docs/P006-soul-window-dev-guide.md`: Soul Window implementation/extension guide.
- `docs/planning/P021-backend-realism-implementation-spec-2026-03-04.md`: Backend realism implementation spec.
- `docs/planning/P021-implementation-ticket-list-2026-03-04.md`: P021 implementation ticket breakdown.
- `docs/planning/P021-rollout-runbook-2026-03-04.md`: P021 canary and rollback runbook.
- `docs/planning/archive/P010-direct-mode-v2-checklist.md`: Direct mode V2 implementation checklist (completed, archived).
- `docs/planning/archive/P011-room-chat-parity-v2-checklist.md`: Room chat parity checklist (completed, archived).
- `docs/planning/archive/P012-shared-runtime-and-room-multi-vrm.md`: Shared runtime extraction checklist (completed, archived).
- `docs/planning/archive/P006-soul-window.md`: canonical Soul Window plan.
- `docs/planning/archive/DRIFT-API.md`: archived drift simulator contract (historical; production path deprecated).
- `backend/docs/DREAMS-RUNBOOK.md`: operational guide for `/api/dreams` status/trigger/log/reset flows.
- `backend/docs/ROOM-CHAT-REMEDIATION-PHASES-1-2-2026-03-05.md`: implementation notes for backend remediation and P013 follow-up.
- `docs/animation/*`: VRM/animation research and pipeline notes.
- `docs/archive/*`: older plans/specs and previous API docs (including archived AUDIT-UNIFIED-CHAT, PLAN-UNIFIED-CHAT, DECISIONS-UNIFIED-CHAT, IMPL-DIRECT-MODE, CODE-REVIEW-GROUP-CHAT).

---

## File Index (Quick Reference)

- `backend/main.py`: app entry + router registration.
- `backend/routers/`: API surface.
- `backend/services/emotion_engine.py`: core emotion engine.
- `backend/services/llm_caller.py`: extracted LLM calling (streaming) for both direct and openclaw modes.
- `backend/services/room_chat_stream.py`: room SSE generator + retry/error policy helpers.
- `backend/services/chat_runtime/pipeline.py`: unified room chat execution pipeline used by routers.
- `backend/services/chat_runtime/context.py`: room routing + Games V2 runtime payload gating.
- `backend/services/direct_llm.py`: direct LLM client + shared message normalization.
- `backend/services/direct_tool_runtime.py`: bounded tool loop with memory tools.
- `backend/services/memory_bridge.py`: memory search/read/write via OpenClaw SQLite index.
- `backend/services/soul_window_service.py`: Soul Window read-model helpers.
- `backend/services/workspace_events.py`: workspace events timeline service.
- `backend/services/chat_context_runtime.py`: shared chat/room context + workspace helper functions.
- `backend/services/emotion_runtime.py`: shared chat/room emotion pre/post hooks (session-scoped weather reset behavior).
- `backend/services/emotion/`: modular emotion taxonomy, inference, and calibration components.
- `backend/services/background_tasks.py`: shared background task scheduling helper.
- `backend/services/soul_parser.py`: SOUL markdown parser.
- `backend/db/connection.py`: schema + migrations.
- `frontend/src/App.tsx`: main chat UI (handles both single-agent and multi-agent rooms).
- `frontend/src/components/ParticipantsDrawer.tsx`: right-side drawer for room participant management.
- `frontend/src/components/MoodIndicator.tsx`: compact mood chip in header.
- `frontend/src/components/BondModal.tsx`: relationship modal.
- `frontend/src/components/AboutModal.tsx`: SOUL profile modal.
- `frontend/src/avatar/AvatarRenderer.ts`: VRM renderer.
- `frontend/src/avatar/AvatarRendererRegistry.ts`: per-agent renderer lookup for room-mode lip-sync.
- `frontend/src/types/chat.ts`: unified ChatMessage type + AgentStatus + roomMessageToChatMessage converter.
- `frontend/src/hooks/useChat.ts`: unified chat hook (DM + room mode).
- `frontend/src/utils/api.ts`: API client + SSE.
- `frontend/src/utils/soulWindowApi.ts`: Soul Window API wrappers.
- `frontend/src/routes/*`: routing map.
- `frontend/public/vrm/vrm-manifest.json`: VRM model list.
- `frontend/public/animations/animation-manifest.json`: animation list.
