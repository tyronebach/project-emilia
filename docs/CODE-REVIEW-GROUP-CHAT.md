# Code Review: Group Chat (Rooms) Feature

**Date:** 2026-02-12
**Scope:** Full parity review of `/api/rooms` vs core `/api/chat` pipeline
**Status:** V1 implemented, integration gaps identified

---

## 1. Executive Summary

The group chat feature is implemented as a **"rooms" system** — a cleanly separated entity from 1:1 sessions. The architecture is sound: dedicated tables, proper sender attribution, multi-agent routing, and SSE streaming with per-agent events.

**The good:** It correctly imports and calls the emotion engine pre/post-LLM hooks, uses the same behavior tag parser, and shares game context injection logic from core chat. This avoids duplicate implementations of the most critical subsystems.

**The gaps:** Several core chat features are silently absent from room chat. These aren't bugs — they're V1 scope cuts — but they create **behavioral divergence** that will confuse agents and degrade the experience as rooms get real usage.

### Severity Summary

| Severity | Count | Description |
|----------|-------|-------------|
| P0 (Breaking) | 1 | No `game_context` validation (raw dict bypasses Pydantic safety) |
| P1 (Divergence) | 5 | Missing compaction, first-turn context, orphan cleanup, response guard, workspace milestones |
| P2 (Polish) | 3 | Missing emotion debug events, avatar SSE event, session_id in emotion logs |
| P3 (Deferred) | 2 | No room-level compaction service, no runtime_trigger support |

---

## 2. Architecture Overview

```
Core Chat (1:1)                          Room Chat (Group)
─────────────────                        ─────────────────
POST /api/chat                           POST /api/rooms/{id}/chat
  ├─ verify_token + get_user_id            ├─ verify_token + get_user_id
  ├─ get_agent_id (header)                 ├─ _ensure_room_access (participant check)
  ├─ get_session_id (header)               ├─ determine_responding_agents (mention routing)
  │                                        │
  ├─ _process_emotion_pre_llm ◄────────────┤─ _process_emotion_pre_llm  ✅ shared
  ├─ _build_first_turn_context             ├─ (MISSING)                  ❌
  ├─ _build_llm_messages                   ├─ build_room_llm_messages    (different)
  │   └─ inject_game_context ◄─────────────┤─ _inject_game_context_if_present ✅
  │                                        │
  ├─ LLM call (single agent)              ├─ LLM call (per responding agent, sequential)
  ├─ parse_chat_completion ◄───────────────┤─ parse_chat_completion      ✅ shared
  ├─ extract_avatar_commands ◄─────────────┤─ extract_avatar_commands    ✅ shared
  │                                        │
  ├─ MessageRepository.add                 ├─ RoomMessageRepository.add  (separate table)
  ├─ SessionRepository.update_last_used    ├─ (via increment_message_count)
  ├─ _ensure_workspace_milestones          ├─ (MISSING)                  ❌
  ├─ _process_emotion_post_llm ◄───────────┤─ _process_emotion_post_llm ✅ shared
  ├─ _maybe_compact_session                ├─ (MISSING)                  ❌
  └─ emotion_debug payload                 └─ (MISSING)                  ❌
```

---

## 3. What Hooks In Correctly

### 3.1 Emotion Engine — Pre-LLM ✅

`rooms.py:446` and `rooms.py:555` both call:
```python
emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
    user_id, agent_id, request.message, None  # session_id=None
)
```

This means **per-agent emotion processing works correctly in rooms:**
- Emotional state loaded/created per `(user_id, agent_id)` pair
- Time-based decay applied since last interaction
- Trigger classifier runs with sarcasm co-occurrence dampening
- V/A deltas projected onto mood weights
- Emotional context block generated and injected into LLM prompt

**The sarcasm mitigation system IS active** — it's embedded in `EmotionEngine.detect_triggers()` which is called inside `_process_emotion_pre_llm()`.

### 3.2 Emotion Engine — Post-LLM ✅

`rooms.py:489` and `rooms.py:652` both spawn:
```python
_spawn_background(asyncio.to_thread(
    _process_emotion_post_llm,
    user_id, agent_id, behavior, None, pre_llm_triggers, message,
))
```

This means **mood drift from agent behavior IS happening:**
- Agent self-reported mood mapped to triggers (happy→joy, sad→sadness, etc.)
- Multi-signal outcome inference runs
- Trigger calibration learning updates
- Relationship dimension updates (trust, intimacy, etc.)
- V2 event logging (though without session_id — see P2)

### 3.3 Behavior Tag Parsing ✅

Both streaming and non-streaming paths use the same `parse_chat.py` functions:
- Non-streaming: `parse_chat_completion(result)` at `rooms.py:465`
- Streaming: `extract_avatar_commands(full_content)` at `rooms.py:630`

All six behavior fields stored in `room_messages`: intent, mood, mood_intensity, energy, move, game_action.

### 3.4 Game Context Injection ✅

`rooms.py:120-143` wraps the shared `inject_game_context()` function with a room-specific adapter. The trusted prompt resolution uses server-side registry (`_resolve_trusted_prompt_instructions`), not client-provided values.

### 3.5 Shared Background Task Infrastructure ✅

Room chat imports `_spawn_background` from core chat and uses it identically for post-LLM emotion processing.

---

## 4. What's Missing or Divergent

### 4.1 [P0] Game Context Validation Bypass

**File:** `backend/schemas/requests.py:359`

Core chat validates game context through `GameContextRequest`:
```python
# ChatRequest
game_context: GameContextRequest | None = None  # Pydantic model with validators
```

Room chat accepts a raw dict:
```python
# RoomChatRequest
game_context: Dict[str, Any] | None = None  # No validation
```

**Impact:** `GameContextRequest` enforces:
- `game_id` stripped and non-empty
- `valid_moves` capped at 100 entries, each ≤ 64 chars
- `prompt_instructions` stripped
- `state_text`, `last_user_move`, `avatar_move` stripped

Without this validation, a malicious or buggy client could send arbitrarily large game state payloads through the room chat endpoint.

**Fix:** Change `RoomChatRequest.game_context` to use `GameContextRequest | None`.

---

### 4.2 [P1] No Session Compaction

**Core chat:** `_maybe_compact_session(session_id)` fires after every response. When message count exceeds `settings.compact_threshold`, it summarizes old messages and prunes them.

**Room chat:** The schema has `rooms.summary`, `rooms.summary_updated_at`, `rooms.compaction_count`, and `RoomRepository.update_summary()` exists — but **nothing triggers compaction**. Room history will grow unbounded.

**Impact:** After ~50+ messages per room, LLM context windows will fill up. `build_room_llm_messages` fetches `settings.chat_history_limit` messages, but there's no summary of older messages like core chat provides.

**Fix:** Implement `_maybe_compact_room(room_id)` analogous to `_maybe_compact_session`, or extract the compaction logic into a shared service that works for both.

---

### 4.3 [P1] No First-Turn Context

**Core chat:** `_build_first_turn_context()` injects on the first message:
```
Session facts (UTC):
- now_utc: 2026-02-12T08:00:00+00:00
- time_of_day_utc: morning
- days_since_last_interaction: 3
- upcoming_events_next_7_days:
  - birthday on 2026-02-15: User's birthday
```

**Room chat:** No equivalent exists. Agents in rooms have no awareness of time, recency, or workspace events on the first message.

**Impact:** Agents will miss time-aware greetings ("Good morning!", "It's been a while!") and event-aware conversation hooks in group chat.

**Fix:** Call `_build_first_turn_context()` for at least the first responding agent, or for each agent individually on their first turn in the room.

---

### 4.4 [P1] No Orphan Message Cleanup on LLM Failure

**Core chat:** If the LLM call fails, the user message is cleaned up:
```python
except Exception:
    if user_msg_id:
        MessageRepository.delete_by_id(user_msg_id)
    raise
```

**Room chat:** The user message is stored at `rooms.py:412-418` **before** the agent loop, but if all agents fail, the user message remains orphaned in room_messages. In the streaming path, there's no try/except around the user message storage at all.

**Impact:** Failed room chats leave dangling user messages in history that never got a response.

**Fix:** Wrap the agent loop in try/except and delete the user message if `responses` is empty and we're about to raise `service_unavailable`.

---

### 4.5 [P1] No MAX_RESPONSE_CHARS Guard in Streaming

**Core chat:** `chat.py:865-866`:
```python
MAX_RESPONSE_CHARS = 50_000
if len(full_content) > MAX_RESPONSE_CHARS:
    logger.warning("[SSE] Response exceeded %d chars, truncating", MAX_RESPONSE_CHARS)
    break
```

**Room chat streaming:** No equivalent guard. A runaway LLM could produce unlimited output per agent, and with multiple agents, this multiplies the risk.

**Fix:** Add the same `MAX_RESPONSE_CHARS` guard to `_stream_room_chat_sse`.

---

### 4.6 [P1] No Workspace Milestone Tracking

**Core chat:** After each response, if the agent has a workspace:
```python
_spawn_background(asyncio.to_thread(
    _ensure_workspace_milestones,
    agent_workspace=agent_workspace,
    ...
))
```

This writes auto milestones (first interaction, Nth interaction, first game, etc.) to the agent's workspace events file.

**Room chat:** No workspace milestone tracking at all. Interactions in group chat don't contribute to relationship milestones.

**Impact:** If a user primarily interacts with an agent through group chat, their relationship milestones won't advance.

**Fix:** Load agent workspace and call `_ensure_workspace_milestones` for each responding agent.

---

### 4.7 [P2] No Emotion Debug Events in SSE

**Core chat streaming** emits two special SSE events:
```
event: avatar
data: {"intent": "greeting", "mood": "happy", "intensity": 0.8}

event: emotion
data: {"triggers": [...], "context_block": "...", "snapshot": {...}}
```

**Room chat streaming** includes behavior data only inside the `agent_done` payload. No separate `avatar` or `emotion` events are emitted.

**Impact:** Frontend debug panels and avatar behavior system can't receive real-time emotion data from room chat. The existing avatar rendering pipeline (which listens for `avatar` events) won't animate during room chat.

**Fix:** Emit `avatar` and `emotion` events per-agent in `_stream_room_chat_sse`, after the `agent_done` event.

---

### 4.8 [P2] Emotion Event Logs Missing session_id

**Room chat** passes `None` for session_id to both emotion hooks:
```python
await _process_emotion_pre_llm(user_id, agent_id, message, None)
_process_emotion_post_llm(user_id, agent_id, behavior, None, ...)
```

In `_process_emotion_post_llm`, this `None` propagates to `EmotionalStateRepository.log_event_v2(session_id=None)`.

**Impact:** V2 emotion event logs from room chat can't be correlated to their room context. Designer tools that analyze emotion events by session won't show room interactions.

**Fix:** Pass `room_id` as the session_id parameter, or add a dedicated `room_id` field to the event log schema.

---

### 4.9 [P2] Non-streaming Path Uses Different Parse Flow

**Core chat non-streaming:** Calls `parse_chat_completion(result)` which internally calls `extract_avatar_commands()`. Returns `response_text` (cleaned) and `behavior`.

**Room chat non-streaming:** Also calls `parse_chat_completion(result)` at `rooms.py:465`. This is correct and consistent.

**Room chat streaming:** Calls `extract_avatar_commands(full_content)` directly at `rooms.py:630`. This is also correct — same as core chat streaming.

No issue here — noting for completeness.

---

### 4.10 [P3] No runtime_trigger Support

**Core chat** supports `runtime_trigger=True` on `ChatRequest`, which:
- Sets message origin to `game_runtime` instead of `user`
- Skips user message in emotion trigger detection (empty string)
- Excludes game_runtime messages from conversation count
- Doesn't pass user_message to post-LLM learning

**Room chat** has no runtime_trigger field on `RoomChatRequest`. Game runtime events can't be injected into room conversations.

**Impact:** Multiplayer games in rooms can't auto-inject game state changes as runtime triggers.

**Fix:** Add `runtime_trigger: bool = False` to `RoomChatRequest` and mirror the core chat handling.

---

## 5. LLM Context Building Comparison

### Core Chat: `_build_llm_messages()`
```
[system: "Previous conversation summary: ..."]     ← if compacted
[user/assistant history messages...]                ← raw role/content
[user: {emotional_context}\n\n{first_turn_context}\n\n{message + game_context}]  ← current
```

Emotional context is **prepended to the user message content** as text.

### Room Chat: `build_room_llm_messages()`
```
[system: "You are in a group chat with: Alpha, Beta..."]  ← room context
[system: {emotional_context}]                              ← separate system message
[system: "Previous conversation summary: ..."]             ← if exists
[user: "[Alpha]: Hi there!"]                               ← other agent messages as user role
[assistant: "Hey Alpha!"]                                  ← own messages as assistant role
[user: "[User Name]: Hello everyone"]                      ← user messages
```

Emotional context is injected as a **separate system message** rather than prepended to user content.

**Assessment:** The room approach of using a separate system message is arguably better — it keeps the emotional context cleanly separated. However, this means the two paths format the emotional context differently in the LLM prompt, which could cause subtle behavioral differences.

---

## 6. Security Review

### 6.1 Authentication & Authorization ✅
- All endpoints require `verify_token` dependency
- Room access checked via `_ensure_room_access()` → `RoomRepository.user_can_access()`
- Agent access checked via `UserRepository.can_access_agent()` on room creation and agent addition

### 6.2 Input Validation ✅ (with P0 exception)
- `CreateRoomRequest`: name stripped/validated, agent_ids deduped and cleaned
- `RoomChatRequest`: message 1-10000 chars, mention_agents cleaned
- `AddRoomAgentRequest`: response_mode and role use Literal types
- **Exception:** `game_context` is `Dict[str, Any]` — see P0 above

### 6.3 Game Prompt Injection Prevention ✅
- `_resolve_trusted_prompt_instructions()` is imported from core chat and uses server-side game registry
- `_inject_game_context_if_present()` passes the trusted prompt explicitly to `inject_game_context()`
- Client-provided `prompt_instructions` in game_context is effectively ignored (the trusted prompt overrides it)

### 6.4 SQL Injection ✅
- All queries use parameterized statements
- `f"UPDATE room_agents SET {', '.join(updates)}"` constructs column names from code, not user input

### 6.5 Missing Rate Limiting ⚠️
- No per-room or per-user rate limiting on chat endpoint
- A user could spam requests to multiple agents in a room, multiplying LLM costs
- Core chat also doesn't have rate limiting, so this is parity, but rooms amplify the concern

---

## 7. Data Model Review

### 7.1 Schema Quality ✅
- Proper foreign keys with ON DELETE CASCADE
- Compound primary keys on junction tables
- Indexes on frequently queried columns (room_id + timestamp, sender_type + sender_id)
- Settings stored as JSON with proper parse/merge logic

### 7.2 Missing: compaction_count column ⚠️
The schema has `compaction_count` on `rooms` and `RoomRepository.update_summary()` increments it, but no code reads it for decision-making. In core chat, compaction is triggered by message count threshold — the room equivalent doesn't exist yet.

---

## 8. Frontend Review

### 8.1 State Management ✅
- Clean Zustand store (`roomStore.ts`) with minimal, focused state
- `streamingByAgent` map handles per-agent streaming correctly
- `clearRoomState()` on unmount prevents stale state

### 8.2 Optimistic Updates ✅
- User message added immediately with `local-user-${Date.now()}` ID
- Streaming content shown progressively per agent
- Error messages surfaced as system messages

### 8.3 Missing: Behavior/Avatar Integration ❌
- `RoomChatPage.tsx` doesn't pass behavior data to the avatar system
- Clicking an agent sets `focusedAgentId` but only shows a text placeholder ("VRM hidden by default")
- The `useRoomChat` hook receives `agent_done` events with behavior data but doesn't forward them to the avatar rendering pipeline
- No `applyAvatarCommand()` call anywhere in the room chat flow

### 8.4 Missing: Scroll-to-Bottom ⚠️
- No auto-scroll when new messages arrive or streaming content updates
- `ScrollArea` doesn't have a ref for programmatic scrolling

---

## 9. Test Coverage Review

### What's Tested ✅
- Room CRUD lifecycle (create, list, get, update, delete)
- Access control (non-participant blocked)
- Agent management (add, update, remove, minimum-1 guard)
- Chat mention routing (explicit mentions, always-mode fallback)
- Message storage and history retrieval

### What's NOT Tested ❌
- SSE streaming path (`stream=1`)
- Game context injection in room chat
- Multiple agents responding in a single request
- Emotional context injection (mocked out in tests)
- Error handling (LLM timeout, LLM error)
- Edge cases: empty room, all agents fail, mention non-existent agent
- Frontend components and hooks (no frontend tests for rooms)

---

## 10. Recommendations for Integration

### Phase 1: Safety (P0)
1. Change `RoomChatRequest.game_context` from `Dict[str, Any]` to `GameContextRequest | None`

### Phase 2: Parity (P1)
2. Add `MAX_RESPONSE_CHARS` guard to room streaming
3. Add orphan user message cleanup on total agent failure
4. Implement room compaction (extract `_maybe_compact` into shared service)
5. Add first-turn context injection
6. Add workspace milestone tracking

### Phase 3: Polish (P2)
7. Emit `avatar` and `emotion` SSE events per-agent
8. Pass room_id to emotion event logs
9. Wire up behavior data to avatar system in frontend

### Phase 4: Feature Complete (P3)
10. Add `runtime_trigger` support for multiplayer games
11. Implement multi-VRM rendering for rooms

---

## 11. File Reference

| File | Lines | Role |
|------|-------|------|
| `backend/routers/rooms.py` | 707 | Route handlers, chat logic, SSE streaming |
| `backend/services/room_chat.py` | 158 | Mention routing, LLM context building |
| `backend/db/repositories/room_repository.py` | 442 | Room + message CRUD |
| `backend/schemas/requests.py` | 353-382 | Room request models |
| `backend/schemas/responses.py` | 134-217 | Room response models |
| `backend/tests/test_rooms.py` | 304 | Backend tests |
| `frontend/src/store/roomStore.ts` | 70 | Room state management |
| `frontend/src/hooks/useRoomChat.ts` | 148 | Chat send/load/abort |
| `frontend/src/components/rooms/RoomChatPage.tsx` | 270 | Chat UI |
| `frontend/src/components/rooms/RoomListPage.tsx` | ~180 | Room list UI |
| `frontend/src/components/rooms/CreateRoomModal.tsx` | ~110 | Room creation dialog |
| `docs/planning/archive/P005-group-chat.md` | 1040 | Original design doc |

### Core chat files the room imports from:
| Import | Source |
|--------|--------|
| `_process_emotion_pre_llm` | `routers/chat.py` |
| `_process_emotion_post_llm` | `routers/chat.py` |
| `_resolve_trusted_prompt_instructions` | `routers/chat.py` |
| `_spawn_background` | `routers/chat.py` |
| `inject_game_context` | `routers/chat.py` |
| `parse_chat_completion` | `parse_chat.py` |
| `extract_avatar_commands` | `parse_chat.py` |
