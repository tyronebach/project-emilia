# Unified Chat Implementation Plan

Date: 2026-02-17
Status: Planning only (no implementation in this document)

## 0. Target Architecture and Invariants

Target: one room-based chat runtime where a room with one agent is a DM and a room with multiple agents is a group.

Non-negotiable invariants:

1. Preserve dual LLM backend mode per agent (`openclaw` + `direct`).
- Existing behavior to preserve: `backend/routers/chat.py:297`, `backend/routers/chat.py:315`, `backend/services/direct_llm.py:108`.

2. Preserve per-agent emotional continuity keyed by `(user_id, agent_id)`.
- Existing storage model: `backend/db/connection.py:268`, `backend/db/repositories/emotional_state.py:47`.

3. Preserve avatar behavior events and parsing pipeline.
- Existing SSE/event contract in active path: `backend/routers/chat.py:641`, `frontend/src/utils/api.ts:823`.

4. Preserve memory tooling and workspace semantics in direct mode.
- Existing tool loop + memory bridge: `backend/services/direct_tool_runtime.py:152`, `backend/services/memory_bridge.py:208`.

## Migration Strategy (High-Level)

Use a staged migration with compatibility adapters:

1. Introduce canonical room runtime and room-centric APIs.
2. Keep `/api/chat` and `/api/sessions/*` as temporary facades over room orchestration.
3. Frontend switches to room IDs and room APIs.
4. Remove legacy session internals only after parity tests are green.

---

## Phase 0: Database

Goal: make rooms canonical and remove the old split model cleanly.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Add migration script to backfill room data from sessions | `backend/scripts/migrations/M00_unified_chat_rooms.py` (new) | L |
| Add idempotent migration runner hook | `backend/db/connection.py` | M |
| Add session-to-room compatibility mapping table | `backend/db/connection.py` | M |
| Backfill room participants/agents/messages from session tables | `backend/scripts/migrations/M00_unified_chat_rooms.py` (new) | L |
| Add indexes for room history + sender lookups | `backend/db/connection.py` | S |
| Add migration verification command/script | `backend/scripts/migrations/verify_unified_chat.sql` (new) | S |

### Breaking Changes and Migration Strategy

1. No immediate API break in this phase.
2. Keep existing `sessions` and `messages` tables read/write during transition.
3. Create deterministic mapping so each existing session has a corresponding room (prefer room ID == session ID where possible).
4. Backfill message authors:
- user message sender_id from `session_participants` (single-user app assumption)
- assistant sender_id from `messages.agent_id` fallback `sessions.agent_id`

### Test Plan

1. Migration unit tests:
- backfill creates 1 room per session
- message count parity pre/post
- assistant sender attribution parity
2. SQLite integration test on fixture DB snapshot.
3. Idempotency test: running migration twice does not duplicate rows.

---

## Phase 1: Backend Unification

Goal: one orchestrator/router for DM + group, N responders per room.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Create unified room chat orchestrator service | `backend/services/unified_chat_orchestrator.py` (new) | XL |
| Create/restore room router for active runtime | `backend/routers/rooms.py` (new from modernized base) | XL |
| Add responder selection policy service | `backend/services/responder_policy.py` (new) | M |
| Keep `/api/chat` as compatibility facade into orchestrator | `backend/routers/chat.py` | L |
| Keep `/api/sessions/*` as compatibility wrappers while frontend migrates | `backend/routers/sessions.py` | L |
| Register rooms router in app | `backend/routers/__init__.py`, `backend/main.py` | S |

### Breaking Changes and Migration Strategy

1. Add new canonical endpoints:
- `POST /api/rooms/{room_id}/chat?stream=1`
- `GET /api/rooms/{room_id}/history`
- room membership endpoints
2. Keep existing `/api/chat` behavior by routing through canonical orchestrator with a synthetic DM room lookup.
3. Emit SSE in multiplex form with `agent_id` tags for all room chats (single-agent rooms still produce one agent stream).

### Test Plan

1. Backend orchestration tests:
- single-agent room parity with existing `/api/chat`
- multi-agent room with mention targeting
- mixed direct/openclaw responders in one room
2. SSE contract tests for events: `content`, `agent_start`, `agent_done`, `avatar`, `emotion`, `done`.
3. Failure rollback tests: zero successful responders removes user message.

---

## Phase 2: Per-Agent Engine Isolation

Goal: each agent processes emotion/animation/memory independently within shared room context.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Ensure per-agent pre/post emotion runs inside room loop | `backend/services/unified_chat_orchestrator.py` (new) | M |
| Standardize shared-history formatting with speaker attribution | `backend/services/unified_chat_orchestrator.py` (new), `backend/services/room_chat.py` | M |
| Add per-agent context envelope builder | `backend/services/agent_context_builder.py` (new) | M |
| Ensure memory tools route to responder agent workspace/claw id | `backend/services/unified_chat_orchestrator.py` (new), `backend/services/direct_tool_runtime.py` | M |
| Emit per-agent mood snapshots in SSE | `backend/services/unified_chat_orchestrator.py` (new) | S |

### Breaking Changes and Migration Strategy

1. No external break if event payload fields are additive and backward compatible.
2. Remove dependency on single `X-Agent-Id` for room chat; target agents come from request payload + policy.
3. Keep `(user_id, agent_id)` emotional key invariant unchanged.

### Test Plan

1. Emotion isolation tests for two agents in same room receiving different trigger outcomes.
2. Memory isolation tests proving tool calls hit correct workspace and claw memory DB.
3. Prompt/context tests validating each agent sees shared history with correct speaker labels.

---

## Phase 3: Frontend Unification

Goal: one chat experience that adapts layout by room participant count.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Introduce room-centric API client as primary | `frontend/src/utils/api.ts` | L |
| Add room hook to replace session assumptions | `frontend/src/hooks/useRoom.ts` (new) | L |
| Refactor `useChat` to room stream + agent-tagged events | `frontend/src/hooks/useChat.ts` | XL |
| Replace `useSession` usage with room lifecycle | `frontend/src/hooks/useSession.ts` (deprecate), `frontend/src/components/NewChatPage.tsx`, `frontend/src/App.tsx` | XL |
| Make Avatar layout depend on room agent count, not `selectedAgents` only | `frontend/src/components/chat/AvatarStage.tsx`, `frontend/src/App.tsx` | L |
| Partition chat state by room and agent | `frontend/src/store/chatStore.ts` | XL |
| Add room routes and compatibility redirects | `frontend/src/routes/user/$userId/room.$roomId.tsx` (new), `frontend/src/routes/user/$userId/chat.$sessionId.tsx` | M |

### Breaking Changes and Migration Strategy

1. New canonical UI route: `/user/$userId/room/$roomId`.
2. Keep old chat routes as redirects using session->room mapping until full cutover.
3. Deprecate `currentAgent` as request selector; keep it as UI focus default only.

### Test Plan

1. Hook tests for room streaming parser and multi-agent message attribution.
2. Store tests for room-partitioned state and cross-room isolation.
3. Route integration tests for legacy chat URL redirects.
4. Component tests for 1-agent full layout and 2+/grid transitions.

---

## Phase 4: Feature Parity in Multi-Agent Context

Goal: voice/TTS/games/memory/compaction all behave correctly in rooms.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Implement room-level TTS arbitration (one active speaker, per-agent queue) | `frontend/src/hooks/useRoomTTS.ts` (new), `frontend/src/hooks/useChat.ts`, `backend/routers/chat.py` or room router speak contract | L |
| Implement room-aware voice input targeting | `frontend/src/hooks/useVoiceChat.ts`, `frontend/src/hooks/useChat.ts` | L |
| Ensure game runtime trigger semantics for room targeting | `backend/services/unified_chat_orchestrator.py` (new), `frontend/src/store/gameStore.ts`, `frontend/src/components/InputControls.tsx` | L |
| Ensure compaction runs on room history only once per turn | `backend/services/unified_chat_orchestrator.py` (new), `backend/services/compaction.py` | M |
| Ensure memory modal can inspect selected responder agent memory in-room | `frontend/src/components/MemoryModal.tsx`, `frontend/src/utils/api.ts` | M |

### Breaking Changes and Migration Strategy

1. TTS behavior changes from implicit single-agent to explicit room speaker queue.
2. Voice command routing introduces explicit target policy (`@mention`, selected targets, fallback).
3. Keep 1-agent room behavior identical to current UX.

### Test Plan

1. Audio queue tests: overlapping agent replies are serialized.
2. Voice target tests: mention and explicit target list map correctly.
3. End-to-end parity tests: DM room remains feature-parity with legacy chat.

---

## Phase 5: Cleanup

Goal: remove dead code and finalize docs/tests after full cutover.

### Work Items

| Item | Files | Complexity |
|---|---|---|
| Remove session-internal runtime duplication | `backend/routers/chat.py`, `backend/routers/sessions.py`, `backend/db/repositories/sessions.py`, `backend/db/repositories/messages.py` | L |
| Remove dead room helper or merge it into orchestrator | `backend/services/room_chat.py` | S |
| Remove unused frontend session-only assumptions | `frontend/src/hooks/useSession.ts`, `frontend/src/components/InitializingPage.tsx`, `frontend/src/store/userStore.ts` | L |
| Remove orphan room API code paths no longer needed after consolidation | `frontend/src/utils/api.ts` | M |
| Update docs and changelog | `DOCUMENTATION.md`, `CHANGELOG.md`, `docs/*` | S |

### Breaking Changes and Migration Strategy

1. Mark `/api/chat` and `/api/sessions/*` as deprecated, then remove after one stable release window.
2. Remove compatibility mapping only after telemetry confirms no legacy route usage.

### Test Plan

1. Full backend suite + targeted migration and contract tests.
2. Full frontend unit/integration suite + production build.
3. Manual smoke checklist:
- DM room
- 2+ agent room
- add/remove agent while active
- direct/openclaw mixed room
- voice + TTS + game runtime turn

---

## Cross-Phase Risk Controls

1. Keep migration reversible until Phase 5.
- Do not drop `sessions/messages` tables before stable cutover.
2. Preserve payload compatibility.
- Additive SSE fields only until frontend fully migrated.
3. Keep observability.
- Add structured logs with `room_id`, `agent_id`, `chat_mode`, `turn_id`.

## Definition of Done

1. One canonical room chat pipeline handles both DM and group.
2. No active code path depends on single `X-Agent-Id` to choose responders in group mode.
3. Emotion, memory, animation, compaction, voice, TTS, and game runtime semantics work for N agents.
4. Legacy session/chat endpoints either removed or thin compatibility wrappers over room runtime.
