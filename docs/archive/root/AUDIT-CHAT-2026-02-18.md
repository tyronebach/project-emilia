# Chat System Architectural Audit — 2026-02-18

## 1. Current State Map

### Backend

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `backend/main.py` | 59 | **Working** | All 10 routers mounted, including `rooms_router` |
| `backend/routers/chat.py` | 402 | **Working** | DM facade — delegates to room pipeline via `_dm_stream_wrapper()` |
| `backend/routers/rooms.py` | 1084 | **Working** | Full room CRUD + multi-agent chat orchestration, streaming SSE |
| `backend/routers/sessions.py` | — | **Deleted** | Does not exist. Fully migrated to rooms. |
| `backend/services/room_chat.py` | 157 | **Working** | Called by `rooms.py` for `determine_responding_agents()` + `build_room_llm_messages()` |
| `backend/services/emotion_engine.py` | 1702 | **Working** | V2 VAD model, trigger calibration, mood injection. Per-(user,agent) keying. |
| `backend/services/emotion_runtime.py` | 316 | **Working** | Pre/post-LLM hooks with per-(user,agent) thread locks. Called from both `chat.py` and `rooms.py`. |
| `backend/services/drift_simulator.py` | 493 | **Working** | Isolated simulation for Designer V2. No coupling to chat runtime. |
| `backend/services/chat_context_runtime.py` | 199 | **Working** | First-turn facts, game context injection, mood snapshots. Per-(user,agent) lookups. |
| `backend/db/repositories/emotional_state.py` | 427 | **Working** | All keyed by `(user_id, agent_id)`. Legacy `apply_decay()` at line 160 is dead code (superseded by engine). |
| `backend/db/repositories/room_repository.py` | 565 | **Working** | Room + message CRUD. Called by `chat.py`, `rooms.py`, `users.py`, `admin.py`. |

**Summary:** The backend is fully room-based. `chat.py` is a thin DM facade that resolves a DM room then delegates to the same `_stream_room_chat_sse()` function in `rooms.py`. No sessions router exists. All emotion/context systems are keyed by `(user_id, agent_id)` — correct for multi-agent isolation.

### Frontend

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `frontend/src/hooks/useChat.ts` | 334 | **Working** | DM chat hook. Calls `streamChat()` → `POST /api/chat?stream=1`. Handles TTS + lip-sync. |
| `frontend/src/hooks/useRoomChat.ts` | 192 | **Working** | Group chat hook. Calls `streamRoomChat()` → `POST /api/rooms/{id}/chat?stream=1`. Per-agent streaming. |
| `frontend/src/hooks/useSession.ts` | 179 | **Working** | Room list/history/CRUD. Imports room APIs (`getRooms`, `getRoom`, `getRoomHistory`, etc). No sessions. |
| `frontend/src/store/chatStore.ts` | 202 | **Working** | DM state. Has multi-agent fields (`roomAgents`, `agentStatus`, `agentMoods`). |
| `frontend/src/store/roomStore.ts` | 150 | **Working** | Group state. Per-agent streaming, avatar commands, emotions. |
| `frontend/src/store/index.ts` | 98 | **Working** | App-level state (`roomId`, `status`, TTS, avatar renderer). |
| `frontend/src/components/chat/AvatarStage.tsx` | 274 | **Working** | Multi-agent adaptive layout. Reads from **chatStore** (DM context). |
| `frontend/src/components/rooms/RoomChatPage.tsx` | 291 | **Working** | Full group chat UI. Reads from **roomStore**. Uses `useRoomChat` hook. |
| `frontend/src/components/rooms/RoomAvatarStage.tsx` | 238 | **Working** | Multi-agent avatar for rooms. Reads from **roomStore**. |
| `frontend/src/components/rooms/RoomListPage.tsx` | — | **Working** | Room management. Creates/deletes rooms, lists them. |
| `frontend/src/components/ChatPanel.tsx` | 111 | **Working** | DM chat overlay. Reads from **chatStore**. |
| `frontend/src/utils/api.ts` | 1035 | **Working** | Monolithic but organized. 13 room methods, all wired. 2 unused: `updateRoomAgent()`, `sendRoomMessage()`. |
| Route: `/user/$userId/chat/$roomId` | — | **Active** | DM chat (App.tsx + useChat + chatStore) |
| Route: `/user/$userId/rooms` | — | **Active** | Room list (RoomListPage) |
| Route: `/user/$userId/rooms/$roomId` | — | **Active** | Group chat (RoomChatPage + useRoomChat + roomStore) |

**Summary:** Both DM and group chat routes exist and are mounted in the TanStack Router route tree (`routeTree.gen.ts` confirms). The frontend has **two parallel stacks** — `useChat`+`chatStore` for DM, `useRoomChat`+`roomStore` for groups — with no shared abstraction.

---

## 2. Contract Audit (Feature-by-Feature Trace)

### Send Message (DM) — WORKING

| Step | File:Line | What Happens |
|------|-----------|-------------|
| UI input | `useChat.ts:165` | `sendMessage()` guards against double-send, sets status='thinking' |
| API call | `api.ts:633` | `streamChat()` POSTs to `/api/chat?stream=1` with `{ message, room_id }` |
| Headers | `api.ts:167-183` | `X-User-Id`, `X-Agent-Id`, `Authorization` |
| Backend entry | `chat.py:43` | Validates user/agent, resolves DM room via `RoomRepository.get_or_create_dm_room()` |
| Store user msg | `chat.py:89-97` | `RoomMessageRepository.add()` |
| Delegation | `chat.py:259` | `_dm_stream_wrapper()` calls `rooms.py:_stream_room_chat_sse()` |
| Emotion pre | `rooms.py:783` | `process_emotion_pre_llm()` — decay, triggers, context block |
| LLM messages | `rooms.py:792` | `build_room_llm_messages()` + game/first-turn context injection |
| LLM call | `rooms.py:805/881` | Direct mode (tool_loop) or OpenClaw (httpx streaming) |
| Behavior extract | `rooms.py:954` | `extract_avatar_commands()` strips `[MOOD:X]` etc. |
| Store agent msg | `rooms.py:959` | Cleaned content + behavior metadata stored |
| SSE events | `rooms.py:1035-1061` | `avatar`, `emotion`, `agent_done`, `done` events emitted |
| DM transform | `chat.py:272-336` | Strips `agent_id` from events, reshapes `agent_done` → `{ done: true, response }` |
| Frontend parse | `api.ts:682-742` | Routes SSE to `onChunk`, `onAvatar`, `onEmotion`, `onDone` |
| UI update | `useChat.ts:198-233` | Updates chatStore messages, applies avatar commands, triggers TTS |

**Verdict:** End-to-end functional. SSE contract matches between backend and frontend.

### Send Message (Group) — PARTIALLY WORKING

| Step | File:Line | Status |
|------|-----------|--------|
| UI input | `RoomChatPage.tsx:~170` | Send button → `useRoomChat.sendMessage()` |
| API call | `useRoomChat.ts:65` | `streamRoomChat(roomId, ...)` → `POST /api/rooms/{id}/chat?stream=1` |
| Backend | `rooms.py:540-740` (non-stream) / `rooms.py:743-1084` (stream) | Multi-agent loop, per-agent LLM call |
| Per-agent SSE | `rooms.py:770-1084` | `agent_start`, `content`, `avatar`, `emotion`, `agent_done` per agent |
| Frontend parse | `api.ts:795-948` | Routes events with `agent_id` to `onEvent` callback |
| Store update | `useRoomChat.ts:71-137` | Updates `roomStore` per-agent streaming, status, avatar, emotion |
| Avatar | `useRoomChat.ts:102-104` | Only applies to `focusedAgentId` |

**Verdict:** Backend is fully functional for multi-agent. Frontend hook + store are wired. But TTS and multi-agent avatar are missing.

### Emotion Display — WORKING (DM), WORKING (Group)

- **DM:** `emotion` SSE event → `useChat.ts:266` → `chatStore.setLastEmotionDebug()`. Single-agent, no `agent_id` needed.
- **Group:** `emotion` SSE event includes `agent_id` → `useRoomChat.ts:118-124` → `roomStore.setEmotion(agentId, snapshot)`. Per-agent keying correct.
- **Backend:** Both paths call `process_emotion_pre_llm()` per agent in the loop (`rooms.py:783`). Keyed by `(user_id, agent_id)`. Correct isolation.

### Avatar/Animation — PARTIAL (Group)

- **DM:** `avatar` SSE → `useChat.ts:207` → `applyAvatarCommand()` on the single renderer. Works.
- **Group:** `avatar` SSE → `useRoomChat.ts:102-104` → applies only to `focusedAgentId`. Other agents' avatar commands stored in `roomStore.avatarCommandByAgent` but NOT consumed by their respective VRM renderers. `RoomAvatarStage.tsx` reads `avatarCommandByAgent` from the store (line 63), so the data is available, but individual `AvatarPanel` instances don't consume it.

### Voice/TTS — DM ONLY

- **DM:** `useChat.ts` has `speakText()` (line 70-146) that calls `/api/speak` and manages audio/lip-sync. Fully wired.
- **Group:** `useRoomChat.ts` has **no TTS integration at all**. No `speakText()`, no audio management, no lip-sync. Group chat is text-only.

### Bond/Drift — CORRECT KEYING

- Backend: `EmotionalStateRepository` keyed by `(user_id, agent_id)` throughout.
- `emotion_runtime.py:26-33`: Thread locks keyed by `(user_id, agent_id)`.
- Drift simulator: Per-(user, agent) config. Isolated from runtime.
- Frontend: `roomStore.emotionByAgent` keyed by `agent_id`. `chatStore.agentMoods` keyed by agent ID.

### History Loading — WORKING (Both)

- **DM:** `useSession.ts:66` calls `getRoomHistory(rid)` → `GET /api/rooms/{id}/history`. Messages loaded into `chatStore`.
- **Group:** `useRoomChat.ts:29-51` `loadHistory()` calls `getRoomHistory(roomId)` → same endpoint. Messages loaded into `roomStore.messages`. Each message has `sender_id` (agent attribution).

---

## 3. What's Broken

### 3.1 Group Chat: No TTS / Voice — BROKEN

`useRoomChat.ts` has zero TTS logic. Compare:
- `useChat.ts:70-146`: Full `speakText()` with audio element, ElevenLabs call, lip-sync timing
- `useRoomChat.ts`: Nothing. No audio, no speak call, no voice queue

**Impact:** Group chat is silent. Agents respond with text only.

### 3.2 Group Chat: Avatar Commands Only Apply to Focused Agent — LIMITATION

`useRoomChat.ts:102-104`:
```typescript
if (focusedAgentId && data.agent_id === focusedAgentId) {
  applyAvatarCommand(data);
}
```

Only the focused agent gets avatar commands applied to the renderer. Other agents' commands are stored in `roomStore.avatarCommandByAgent` but never applied to their respective VRM renderers.

**Impact:** In a 3-agent group, only one agent animates. The others are frozen.

**Root cause:** There's a single `avatarRenderer` in `useAppStore` (line 98 of `store/index.ts`). Multi-agent would need per-agent renderers, which `RoomAvatarStage.tsx` doesn't set up.

### 3.3 Dual AgentStatus Type Conflict — BUG

- `chatStore.ts:14`: `type AgentStatus = 'idle' | 'thinking' | 'speaking'`
- `roomStore.ts:6`: `type AgentStatus = 'idle' | 'thinking' | 'streaming'`

Both export `AgentStatus`. If any component imports from both stores, TypeScript will flag a conflict. The semantic mismatch (`'speaking'` vs `'streaming'`) means they can't be unified without a decision on which states exist.

### 3.4 Naming Convention Mismatch — TECH DEBT

- `chatStore` messages use `agentId` (camelCase)
- `roomStore` / API types use `agent_id` (snake_case)
- `Agent` type (chatStore) vs `RoomAgent` type (roomStore) have different field names

This prevents sharing components between DM and group contexts without adapter code.

### 3.5 Dead Code in Emotional State Repository — MINOR

`emotional_state.py:160-203`: `apply_decay()` method implements linear interpolation decay. Superseded by `EmotionEngine.apply_decay()` (exponential decay). Not called from anywhere.

### 3.6 Unused API Methods — MINOR

- `api.ts:507` `updateRoomAgent()` — declared, never called
- `api.ts:552` `sendRoomMessage()` — declared, never called (streaming variant used instead)

### 3.7 mood_weights Initialization Workaround — FRAGILE

`emotion_runtime.py:79-88`: If `mood_weights` from DB is empty/null, falls back to `profile.mood_baseline`. Documented as "Bug #1". Still needed in production — the schema doesn't enforce non-null mood_weights on creation.

---

## 4. Complexity Ratings

| Subsystem | Rating | Rationale |
|-----------|--------|-----------|
| `chat.py` (DM facade) | **Reasonable** | 402 lines. Clean delegation to room pipeline. `_dm_stream_wrapper` is the only complexity — it reshapes SSE events. Single responsibility after refactor. |
| `rooms.py` (room chat) | **Over-engineered** | 1084 lines. Dual streaming/non-streaming code paths with significant duplication (lines 540-740 vs 743-1084 build LLM messages identically). Inline LLM calling for both direct+openclaw modes. Should extract shared message-building and LLM-calling into a service. |
| Emotion pipeline | **Reasonable** | Clean layered architecture: engine (math) → runtime (hooks) → repository (persistence). Thread-safe. 1702-line engine is large but well-organized with clear method boundaries. |
| Session vs Room | **Simple** | Sessions are gone. No confusion. Rooms are canonical. Clean. |
| Frontend state (chatStore vs roomStore) | **Tangled** | Two parallel stores with overlapping concerns, different type conventions, and conflicting `AgentStatus` exports. Neither is wrong individually, but having both makes the codebase confusing and prevents component reuse. |
| `api.ts` | **Reasonable** | 1035 lines in one file is large but organized by clear section comments. Could be split but isn't causing problems. |
| `useChat` vs `useRoomChat` hooks | **Tangled** | Two hooks with no shared abstraction. `useChat` has TTS/lip-sync; `useRoomChat` doesn't. Both do SSE parsing but with different event shapes. Unifying would reduce the surface area. |
| Room repository | **Simple** | Clean CRUD. Well-separated from emotion. |

---

## 5. Non-Chat Smoke Test

| System | Exists | Functional | Chat-Coupled | Verdict |
|--------|--------|-----------|--------------|---------|
| Debug Panel (`DebugPanel.tsx`, `AvatarDebugPanel.tsx`) | Yes | Yes | No | **OK** |
| Designer V2 (`backend/routers/designer_v2.py`) | Yes (1254 lines) | Yes | No | **OK** — mounted |
| Admin Panel (`AdminPanel.tsx`) | Yes (1151 lines) | Yes | No | **OK** |
| VRM Viewer (`avatar/AvatarRenderer.ts`) | Yes | Yes | No | **OK** |
| TTS (`services/elevenlabs.py`) | Yes (167 lines) | Yes | No | **OK** — standalone |
| Memory Routes (`routers/memory.py`) | Yes (74 lines) | Yes | No | **OK** — mounted |

**All non-chat systems are isolated and unaffected by chat architecture changes.**

---

## 6. Recommendations (Prioritized)

### Critical Fixes

1. **Unify `AgentStatus` type** — `chatStore.ts:14` and `roomStore.ts:6` export conflicting types. Decide on one canonical set (`'idle' | 'thinking' | 'streaming' | 'speaking'`) and put it in a shared types file.

2. **Delete dead `apply_decay()` in repository** — `emotional_state.py:160-203` is unused code with wrong math (linear vs exponential). Remove it.

### Architecture Simplifications

3. **Extract LLM calling from `rooms.py`** — The 1084-line router has inline httpx streaming for OpenClaw + DirectLLM tool loop. Extract a `call_llm_streaming()` service that both streaming and non-streaming paths use. Would cut `rooms.py` by ~300 lines.

4. **Merge chatStore and roomStore** — Both manage per-agent messages, status, emotions, and avatar commands. Unify into a single `chatStore` with room-partitioned state (per `DECISIONS-UNIFIED-CHAT.md` Decision #5). The DM path is just a single-agent room.

5. **Unify `useChat` and `useRoomChat`** — After store merge, consolidate into one hook that handles both DM (via `/api/chat` facade) and group (via `/api/rooms/{id}/chat`). The SSE event shapes are nearly identical — the DM wrapper just strips `agent_id`.

### Dead Code Removal

6. **Delete `api.ts:507` `updateRoomAgent()`** — unused, no callers
7. **Delete `api.ts:552` `sendRoomMessage()`** — unused, streaming variant covers all use
8. **Delete `emotional_state.py:160-203` `apply_decay()`** — superseded by engine
9. **Delete trigger buffer methods** in `emotional_state.py:274+` (`get_trigger_buffer`, `append_to_buffer`, `clear_buffer`) — check if any callers remain

### Group Chat Path (Minimum Viable)

10. **Add TTS to `useRoomChat`** — Port `speakText()` from `useChat.ts`. Per-agent voice selection using `agent.voice_id`. Simple sequential queue (agent finishes speaking before next starts). ~100 lines of new code.

11. **Multi-agent avatar rendering** — `RoomAvatarStage.tsx` needs per-agent `AvatarRenderer` instances (currently there's one global renderer in `useAppStore`). Each tile needs its own Three.js scene + VRM.

12. **Apply avatar commands to all agents** — Remove the `focusedAgentId` guard in `useRoomChat.ts:102`. Route commands to the correct per-agent renderer instead.

### Risk Areas

13. **`rooms.py` streaming error handling** — Lines 728-731: if one agent's LLM call fails, it logs and continues. The error is yielded as `agent_error` SSE. Frontend handles it, but there's no retry or user notification beyond the event.

14. **mood_weights null initialization** — `emotion_runtime.py:79-88` workaround for null mood_weights is still load-bearing. A migration to enforce `NOT NULL DEFAULT '{}'` on `mood_weights_json` would remove this fragility.

15. **Single `avatarRenderer` in appStore** — `store/index.ts` holds one renderer. Fundamentally incompatible with multi-agent rendering. Any group chat avatar work requires refactoring to per-agent renderer management.

16. **`_dm_stream_wrapper` late import** — `chat.py:259` does `from routers.rooms import _stream_room_chat_sse` inside the function body (circular import avoidance). Fragile — any rename breaks silently at runtime. Consider extracting the shared SSE generator to a service module.
