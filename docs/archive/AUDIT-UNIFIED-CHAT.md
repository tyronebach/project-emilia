# Unified Chat Architecture Audit

Date: 2026-02-17
Scope: backend + frontend + docs + live SQLite schema

## 1. Executive Summary

The repository currently runs a **session-first chat runtime** with partial multi-agent extensions, while a full room-based stack still exists in code/history but is not wired into the app runtime.

- Working core path: `/api/chat` + `/api/sessions/*` + frontend chat routes (`/user/$userId/chat/*`).
- Dead/stranded path: room repositories, room schemas, room API client functions, and `services/room_chat.py` have no active router/UI entrypoint.
- Half-implemented area: multi-agent state exists (`session_agents`, `messages.agent_id`, `sessionAgents` in UI), but request execution is still selected through a **single** `X-Agent-Id` header.

## 2. Current-State Map

### 2.1 What Works Today

1. 1:1 chat runtime is feature-complete and production-integrated.
- LLM call path (direct + OpenClaw): `backend/routers/chat.py:297`, `backend/routers/chat.py:315`, `backend/routers/chat.py:500`, `backend/routers/chat.py:538`.
- Emotion pre/post hooks: `backend/routers/chat.py:266`, `backend/routers/chat.py:401`, `backend/routers/chat.py:464`, `backend/routers/chat.py:675`.
- SSE avatar/emotion events: `backend/routers/chat.py:641`, `backend/routers/chat.py:650`.
- Background compaction: `backend/routers/chat.py:408`, `backend/routers/chat.py:699`.

2. Sessions support multiple agents in storage and CRUD.
- Multi create and participant management: `backend/routers/sessions.py:63`, `backend/routers/sessions.py:181`, `backend/routers/sessions.py:206`.
- `session_agents` table and backfill: `backend/db/connection.py:127`, `backend/db/connection.py:369`.
- Assistant `agent_id` on message rows: `backend/db/connection.py:365`, `backend/db/connection.py:374`, `backend/db/repositories/messages.py:58`.

3. Frontend can display multiple avatars in adaptive layouts.
- `AvatarStage` 1/2/3/4 tile layouts: `frontend/src/components/chat/AvatarStage.tsx:2`, `frontend/src/components/chat/AvatarStage.tsx:116`, `frontend/src/components/chat/AvatarStage.tsx:136`, `frontend/src/components/chat/AvatarStage.tsx:169`.
- Participant management UI exists: `frontend/src/components/chat/ManageParticipantsPanel.tsx:24`.

### 2.2 What Is Dead or Stranded

1. No rooms router is mounted.
- Active backend router registration excludes rooms: `backend/main.py:10`, `backend/main.py:35`.
- Router exports exclude rooms: `backend/routers/__init__.py:2`, `backend/routers/__init__.py:11`.

2. Room service helper is effectively dead.
- `services/room_chat.py` still exists (`backend/services/room_chat.py:1`), but no active imports/callers found outside itself.

3. Frontend room API client surface is orphaned.
- Room API methods still present: `frontend/src/utils/api.ts:566`, `frontend/src/utils/api.ts:920`.
- No non-`api.ts` call sites for these methods were found.

4. Room routes/components are removed from active route tree.
- Active routes include only chat/session routes: `frontend/src/routeTree.gen.ts:69`, `frontend/src/routeTree.gen.ts:76`, `frontend/src/routeTree.gen.ts:78`.

### 2.3 What Is Half-Implemented

1. Backend multi-agent context is bolted onto single-agent execution.
- Multi-agent history naming + participants context: `backend/routers/chat.py:160`, `backend/routers/chat.py:272`, `backend/routers/chat.py:287`.
- But the route still requires one `X-Agent-Id`: `backend/routers/chat.py:198`, `backend/dependencies.py:26`.

2. Frontend multi-agent UI selection does not drive backend responder set.
- UI "Talk to (N)" selector: `frontend/src/components/InputControls.tsx:127`.
- Request headers still send one `X-Agent-Id` from `currentAgent`: `frontend/src/utils/api.ts:187`, `frontend/src/utils/api.ts:199`.
- Chat send path uses one current agent: `frontend/src/hooks/useChat.ts:172`, `frontend/src/hooks/useChat.ts:183`.

3. Per-agent UI runtime fields exist but are not actively updated by chat flow.
- Fields/actions exist: `frontend/src/store/chatStore.ts:47`, `frontend/src/store/chatStore.ts:53`.
- No callsites found for `setAgentStatus` / `setAgentMood`.

## 3. 1:1 Assumptions Baked In

### 3.1 Backend 1:1 Assumptions

1. Chat dependency contract is single-agent header based.
- `get_agent_id` requires one `X-Agent-Id`: `backend/dependencies.py:26`.
- `/api/chat` consumes that single agent ID: `backend/routers/chat.py:198`.

2. Session filtering assumes one primary agent.
- Optional filtering uses `sessions.agent_id` (not `session_agents`): `backend/db/repositories/sessions.py:41`, `backend/db/repositories/sessions.py:45`.
- Session schema still has required `agent_id` primary field: `backend/db/connection.py:105`, `backend/db/connection.py:107`.

3. Soul/Bond stats query assumes session primary agent identity.
- `_first_interaction_stats` joins messages by `sessions.agent_id = ?`: `backend/services/soul_window_service.py:137`, `backend/services/soul_window_service.py:141`.
- In multi-agent sessions, non-primary agent interactions can be undercounted.

4. TTS selection path still keyed to one active agent header.
- `/api/speak` reads optional single `agent_id` header for voice fallback: `backend/routers/chat.py:745`, `backend/routers/chat.py:749`, `backend/routers/chat.py:759`.

### 3.2 Frontend 1:1 Assumptions

1. Global headers carry only one agent context.
- `getHeaders()` sets one `X-Agent-Id` from `currentAgent`: `frontend/src/utils/api.ts:187`, `frontend/src/utils/api.ts:200`.

2. Session lifecycle still tied to single current agent.
- Fetch sessions by current agent ID: `frontend/src/hooks/useSession.ts:25`, `frontend/src/hooks/useSession.ts:29`.
- History guard rejects session when `session.agent_id !== currentAgent.id`: `frontend/src/hooks/useSession.ts:57`, `frontend/src/hooks/useSession.ts:58`.

3. Initializing flow is singular.
- Greeting/wake flow uses one `currentAgent`: `frontend/src/components/InitializingPage.tsx:23`, `frontend/src/components/InitializingPage.tsx:153`.

4. Voice/TTS playback loop is global single-audio.
- One `audioRef` and single `speakText` pipeline in `useChat`: `frontend/src/hooks/useChat.ts:41`, `frontend/src/hooks/useChat.ts:71`, `frontend/src/hooks/useChat.ts:279`.

5. Multi-agent activity ranking reads `message.agentId`, but most writes use `meta.agent_id`.
- Ranking logic: `frontend/src/store/chatStore.ts:164`.
- Streamed assistant messages currently set `meta.agent_id` in `useChat`: `frontend/src/hooks/useChat.ts:183`.

## 4. What To Salvage vs Rebuild (Deleted Rooms System)

Reference snapshot: `8c5d8e1^:backend/routers/rooms.py`.

### 4.1 Salvage

1. SSE multiplex protocol by `agent_id` on one room stream.
- `agent_start`: `8c5d8e1^:backend/routers/rooms.py:756`
- per-agent content chunk: `8c5d8e1^:backend/routers/rooms.py:828`, `8c5d8e1^:backend/routers/rooms.py:931`
- `agent_done`: `8c5d8e1^:backend/routers/rooms.py:1023`
- per-agent `avatar` and `emotion`: `8c5d8e1^:backend/routers/rooms.py:1041`, `8c5d8e1^:backend/routers/rooms.py:1051`

2. Per-agent dual-mode branch in room orchestration.
- direct + OpenClaw in non-stream helper: `8c5d8e1^:backend/routers/rooms.py:184`, `8c5d8e1^:backend/routers/rooms.py:189`, `8c5d8e1^:backend/routers/rooms.py:210`
- same split in stream path: `8c5d8e1^:backend/routers/rooms.py:795`, `8c5d8e1^:backend/routers/rooms.py:859`

3. Group responder policy hooks (mentions + response modes).
- responder selection callsite: `8c5d8e1^:backend/routers/rooms.py:543`
- helper behavior in `services/room_chat.py`: `backend/services/room_chat.py:51`, `backend/services/room_chat.py:86`.

4. Room-specific compaction wrapper and failure rollback patterns.
- compaction: `8c5d8e1^:backend/routers/rooms.py:287`, `8c5d8e1^:backend/routers/rooms.py:728`, `8c5d8e1^:backend/routers/rooms.py:1072`
- rollback when zero successful replies: `8c5d8e1^:backend/routers/rooms.py:723`, `8c5d8e1^:backend/routers/rooms.py:1069`

### 4.2 Rebuild

1. Router-level duplication between chat and room paths should become one orchestrator.
- Current chat has complete runtime parity with shared helpers (`chat_context_runtime`, `emotion_runtime`): `backend/routers/chat.py:35`, `backend/routers/chat.py:31`.
- A revived rooms path should not re-copy chat loop logic.

2. Frontend state model must be room-partitioned and responder-driven, not `currentAgent`-driven.
- Current source of truth mismatch: `selectedAgents` (UI) vs `currentAgent` (headers/send).

3. Cross-feature handling (voice, TTS queueing, games runtime triggers) needs explicit group semantics.
- Current code paths are single-speaker and single-audio.

## 5. Duplicate Logic Map

## 5.1 `chat.py` vs deleted `rooms.py`

1. LLM branching and transport logic duplicated.
- Chat path direct/openclaw: `backend/routers/chat.py:297`, `backend/routers/chat.py:315`, `backend/routers/chat.py:500`, `backend/routers/chat.py:538`.
- Room path direct/openclaw: `8c5d8e1^:backend/routers/rooms.py:189`, `8c5d8e1^:backend/routers/rooms.py:210`, `8c5d8e1^:backend/routers/rooms.py:795`, `8c5d8e1^:backend/routers/rooms.py:859`.

2. Shared runtime hooks duplicated at orchestration callsites.
- Emotion pre/post, first-turn, game-context injection, milestones all appear in both loops.

3. Compaction logic duplicated with container-specific repositories.
- `_maybe_compact_session`: `backend/routers/chat.py:108`
- `_maybe_compact_room`: `8c5d8e1^:backend/routers/rooms.py:287`

## 5.2 `chat.py` vs `services/room_chat.py`

1. Both construct system+history prompts for group awareness using prefixes.
- session path prefixing by `[AgentName]`: `backend/routers/chat.py:77`, `backend/routers/chat.py:82`.
- room helper prefixing by `[sender_name]`: `backend/services/room_chat.py:155`.

2. Both inject participant context text blocks.
- session participants context: `backend/routers/chat.py:187`.
- room system context: `backend/services/room_chat.py:103`.

## 5.3 Session handling duplication

1. Parallel membership models exist.
- `session_agents`: `backend/db/connection.py:127`
- `room_agents`: `backend/db/connection.py:166`

2. Parallel message models exist.
- `messages` (session-bound): `backend/db/connection.py:325`
- `room_messages` (room-bound): `backend/db/connection.py:179`

3. Parallel CRUD repositories exist.
- `SessionRepository`: `backend/db/repositories/sessions.py:9`
- `RoomRepository`: `backend/db/repositories/room_repository.py:39`

## 6. Emotion + Animation Pipeline (Per-Agent)

### 6.1 Backend Emotion Data Flow

1. Request enters `/api/chat` for one selected agent.
- `agent_id` from header: `backend/routers/chat.py:198`.

2. Pre-LLM emotional processing per `(user_id, agent_id)`.
- lock + load/update in `emotion_runtime`: `backend/services/emotion_runtime.py:21`, `backend/services/emotion_runtime.py:36`, `backend/services/emotion_runtime.py:160`.

3. LLM response stored with behavior metadata + `agent_id`.
- `MessageRepository.add(... agent_id=agent_id, behavior_*)`: `backend/routers/chat.py:366`, `backend/routers/chat.py:369`, `backend/routers/chat.py:374`.

4. Post-LLM emotional update and event logging.
- `process_emotion_post_llm(...)` call: `backend/routers/chat.py:401`, `backend/routers/chat.py:675`.
- Event storage uses `emotional_events_v2.session_id` text field: `backend/db/connection.py:287`, `backend/services/emotion_runtime.py:300`.

5. Persistence model is already per user-agent pair (good for group isolation).
- `emotional_state UNIQUE(user_id, agent_id)`: `backend/db/connection.py:268`, `backend/db/connection.py:281`.
- Repository access by `(user_id, agent_id)`: `backend/db/repositories/emotional_state.py:47`, `backend/db/repositories/emotional_state.py:56`.

### 6.2 Backend Animation Signals

1. Behavior tags are extracted from model output.
- non-stream: `backend/routers/chat.py:364`
- stream: `backend/routers/chat.py:606`

2. SSE `avatar` event emitted with intent/mood/energy/move.
- `backend/routers/chat.py:628`, `backend/routers/chat.py:641`.

3. SSE `emotion` debug snapshot emitted.
- `backend/routers/chat.py:644`, `backend/routers/chat.py:650`.

### 6.3 Frontend Rendering Flow

1. SSE parser dispatches `avatar` + `emotion`.
- `frontend/src/utils/api.ts:823`, `frontend/src/utils/api.ts:835`.

2. Avatar command is applied to renderer keyed by provided `agentId`.
- store routing: `frontend/src/store/index.ts:94`, `frontend/src/store/index.ts:100`.
- chat hook currently supplies `currentAgent?.id`: `frontend/src/hooks/useChat.ts:210`.

3. Message attribution is based on `meta.agent_id` in bubbles.
- `frontend/src/components/MessageBubble.tsx:20`, `frontend/src/components/MessageBubble.tsx:107`.

4. AvatarStage tile status/mood intends per-agent overlays but lacks producers.
- status/mood state source: `frontend/src/components/chat/AvatarStage.tsx:88`, `frontend/src/components/chat/AvatarStage.tsx:89`.
- no runtime calls to setters found.

## 7. DB Reality Check (Live `data/emilia.db`)

`sqlite3 data/emilia.db ".schema"` confirms both model families are live simultaneously:

```sql
CREATE TABLE sessions (... agent_id TEXT NOT NULL ...);
CREATE TABLE session_agents (...);
CREATE TABLE messages (... session_id ..., agent_id TEXT);

CREATE TABLE rooms (...);
CREATE TABLE room_agents (...);
CREATE TABLE room_messages (...);
```

This dual-schema state matches `backend/db/connection.py` where both are created and indexed (`backend/db/connection.py:105`, `backend/db/connection.py:138`, `backend/db/connection.py:325`).

## 8. Architecture Risk Summary

1. Behavioral mismatch risk: UI implies multi-agent targeting while backend still executes one selected agent path.
2. Data-model drift risk: dual session/room schemas encourage duplicated migrations and inconsistent feature rollout.
3. Maintenance risk: previously working room orchestration patterns are stranded, while partial session multi-agent logic adds hidden edge cases.

## 9. Minimal Directional Conclusion

The codebase has enough mature parts to unify without feature reduction:

- Keep and reuse: current chat runtime quality, direct/openclaw dual-mode, emotion/memory/game/compaction hooks.
- Restore and modernize: room-first orchestration and SSE multiplex patterns from `8c5d8e1^:backend/routers/rooms.py`.
- Retire: dead room helper/client surfaces only after unified room runtime and frontend are fully migrated.
