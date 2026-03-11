# P011: Room Chat Parity V2 - User-Agent Continuity

**Status:** Implemented (Phases A-E complete)  
**Created:** 2026-02-13  
**Updated:** 2026-02-13  
**Owner:** Backend + Frontend parity follow-up after `docs/CODE-REVIEW-GROUP-CHAT.md` revalidation

> Implementation note: checklist items are retained as historical execution scaffolding; completion is reflected in commits for phases A-E.

## Goal

Make room chat (`/api/rooms/{room_id}/chat`) behaviorally consistent with 1:1 chat (`/api/chat`) for the same `(user_id, agent_id)` pair:

1. Same emotional drift state progression.
2. Same prompt enrichment primitives (first-turn context, game context, runtime trigger handling).
3. Same safety/reliability guards (rollback, output size limits, compaction behavior).
4. Same debug/observability signals where practical.

Only conversation container differs (`session_id` vs `room_id`), not agent identity or relationship state.

---

## Agent Identity Invariant (Locked)

1. **Canonical bond key remains `(user_id, agent_id)`** via `emotional_state` table.
2. Sessions and rooms are **conversation containers**, not identity boundaries.
3. Room and 1:1 flows must keep calling shared emotion hooks:
   - `routers.chat._process_emotion_pre_llm`
   - `routers.chat._process_emotion_post_llm`
4. Direct-mode no-fallback policy remains unchanged.

---

## Decisions (Locked For P011)

1. **Use existing functionality first, avoid large refactors.**
   - Reuse existing helpers in `routers/chat.py` and existing services before creating new abstractions.
2. **Room emotion correlation uses existing `session_id` column with a room namespace.**
   - Pass `session_id=f"room:{room_id}"` to post-LLM logging path.
   - Avoid DB migration in this phase.
3. **Room SSE contract stays stable for current consumers.**
   - Keep `agent_start`, `agent_done`, `agent_error`.
   - Add optional `avatar` and `emotion` events (do not remove existing payloads).
4. **Compaction tuning reuses existing settings:**
   - `COMPACT_THRESHOLD`
   - `COMPACT_KEEP_RECENT`
   - `COMPACT_MODEL`

---

## Scope

### In Scope

- P0/P1/P2/P3 items listed in `docs/CODE-REVIEW-GROUP-CHAT.md` revalidation.
- Backend parity changes in rooms router + room repository + request schema.
- Frontend room streaming event support and scroll parity.
- New backend/frontend tests for parity and failure handling.

### Out of Scope

- Full multi-VRM room rendering.
- New DB schema for `room_id` on `emotional_events_v2`.
- Rate limiting architecture.
- Large chat/rooms service-layer rewrite.

---

## Current Gap Map (From Revalidation)

1. `RoomChatRequest.game_context` bypasses `GameContextRequest` validation.
2. No room compaction trigger.
3. No room first-turn context injection.
4. No rollback of stored user message when all room agents fail.
5. No room SSE max-response guard.
6. No workspace milestone writes in room path.
7. No dedicated room SSE `avatar` / `emotion` events.
8. Room emotion logs not correlated to room context.
9. No room `runtime_trigger` support.
10. Frontend room hook/page not consuming avatar/emotion parity signals.
11. No room auto-scroll behavior.

---

## Implementation Plan (Execution Order)

## Phase A - Request Model + Runtime Trigger Parity (P0/P3)

### Backend

- [ ] Update `RoomChatRequest` in `backend/schemas/requests.py`:
  - [ ] Change `game_context` from `Dict[str, Any] | None` to `GameContextRequest | None`.
  - [ ] Add `runtime_trigger: bool = Field(False, alias="runtimeTrigger", ...)`.
- [ ] Update room route handling in `backend/routers/rooms.py`:
  - [ ] Compute per-request `runtime_trigger` semantics mirroring `/api/chat`.
  - [ ] Set stored user message origin to `game_runtime` when runtime trigger is true.
  - [ ] Use empty message for pre-LLM trigger detection on runtime trigger.
  - [ ] Pass `None` user message to post-LLM learning on runtime trigger.

### Frontend/API Types

- [ ] Update room request typing in `frontend/src/utils/api.ts`:
  - [ ] Add optional `runtimeTrigger` to `streamRoomChat` and `sendRoomMessage` payload mapping.
  - [ ] Keep existing snake_case backend payload keys (`runtime_trigger`) in request body.

### Tests

- [ ] Add backend tests in `backend/tests/test_rooms.py`:
  - [ ] Invalid room `game_context` now rejected by schema validators.
  - [ ] Runtime trigger stored with `origin='game_runtime'`.
  - [ ] Runtime trigger excluded from default room history unless `includeRuntime=true`.

---

## Phase B - First-Turn Context + Milestones + Emotion Correlation (P1/P2)

### Backend

- [ ] Extend room router imports from chat helpers in `backend/routers/rooms.py`:
  - [ ] `_build_first_turn_context`
  - [ ] `_ensure_workspace_milestones`
- [ ] Add repository helper(s) in `backend/db/repositories/room_repository.py`:
  - [ ] `RoomMessageRepository.get_agent_reply_count(room_id, agent_id, include_game_runtime=False)`.
- [ ] In room non-stream and stream loops:
  - [ ] Detect agent-first-reply-in-room (`reply_count == 0` and not runtime trigger).
  - [ ] Build first-turn context using `_build_first_turn_context(...)`.
  - [ ] Inject first-turn context into latest user turn before LLM call (same order as core: emotional + first-turn + game).
  - [ ] Call `_ensure_workspace_milestones(...)` after successful agent persistence when workspace exists.
  - [ ] Pass `session_id=f"room:{room_id}"` to `_process_emotion_post_llm`.

### Tests

- [ ] Add backend tests in `backend/tests/test_rooms.py`:
  - [ ] First-turn helper invoked on first agent reply only.
  - [ ] Milestone helper invoked for workspace-backed agent.
  - [ ] Post-LLM emotion hook receives namespaced room session ref (`room:<room_id>`).

---

## Phase C - Reliability Guards + Rollback (P1)

### Backend

- [ ] In `backend/routers/rooms.py`, capture inserted user message ID before processing agents.
- [ ] Non-stream path:
  - [ ] If zero agent responses, delete user message before raising `service_unavailable`.
- [ ] Stream path:
  - [ ] Pass user message ID into `_stream_room_chat_sse(...)`.
  - [ ] Track successful agent completions.
  - [ ] On zero completions, delete user message before final done/return.
- [ ] Add room SSE output guard:
  - [ ] Introduce `MAX_RESPONSE_CHARS = 50_000` (match chat).
  - [ ] Guard OpenClaw chunk accumulation and direct-mode final content size.
  - [ ] Log truncation warning with agent_id context.

### Tests

- [ ] Add backend tests in `backend/tests/test_rooms.py`:
  - [ ] All-agent failure path removes stored user message.
  - [ ] Streaming all-agent failure path removes stored user message.
  - [ ] Oversized stream content is truncated/guarded and does not run unbounded.

---

## Phase D - Room Compaction (P1)

### Backend Repository

- [ ] Add compaction helpers in `backend/db/repositories/room_repository.py`:
  - [ ] `RoomMessageRepository.get_all_for_room(room_id, include_game_runtime=False)`.
  - [ ] `RoomMessageRepository.delete_oldest(room_id, keep_recent, include_game_runtime=False)`.

### Backend Router / Service

- [ ] Add `_maybe_compact_room(room_id)` in `backend/routers/rooms.py` (or `backend/services/room_compaction.py` if cleaner).
- [ ] Reuse `CompactionService.summarize_messages` from `backend/services/compaction.py`.
- [ ] Reuse `RoomRepository.get_summary/update_summary/get_message_count`.
- [ ] Trigger room compaction in background after successful room response flow:
  - [ ] non-stream: once per API call (not per-agent).
  - [ ] stream: once after loop when at least one agent reply persisted.
- [ ] Respect room-level switch `settings.compact_enabled` (default true).

### Tests

- [ ] Add backend tests:
  - [ ] Compaction triggers above threshold and updates `rooms.summary`.
  - [ ] Old messages pruned according to `COMPACT_KEEP_RECENT`.
  - [ ] No compaction when `compact_enabled` is false.

---

## Phase E - SSE Parity + Frontend Room UX (P2/P3)

### Backend SSE

- [ ] In `backend/routers/rooms.py` stream path, emit per-agent:
  - [ ] `event: avatar` payload with `agent_id`, `agent_name`, and behavior fields.
  - [ ] `event: emotion` payload with `agent_id`, `agent_name`, triggers/context/snapshot.
- [ ] Keep existing `agent_done` payload unchanged for compatibility.

### Frontend API Parser

- [ ] Update room stream event union in `frontend/src/utils/api.ts`:
  - [ ] Add `avatar` event type.
  - [ ] Add `emotion` event type.
- [ ] Parse and forward these new event types from `streamRoomChat`.

### Frontend Hook/Page

- [ ] Update `frontend/src/hooks/useRoomChat.ts`:
  - [ ] Handle optional `avatar` events.
  - [ ] If focused agent matches event agent, forward to `useAppStore().applyAvatarCommand`.
  - [ ] Keep behavior safe when no focused agent is selected.
- [ ] Update `frontend/src/components/rooms/RoomChatPage.tsx`:
  - [ ] Add scroll-to-bottom behavior for new messages and streaming updates.
  - [ ] Keep current focused-avatar UX (no multi-VRM requirement in this phase).

### Tests

- [ ] Backend stream tests assert avatar/emotion event emission shape.
- [ ] Add frontend tests (new files):
  - [ ] `frontend/src/hooks/useRoomChat.test.tsx` for event handling (`agent_done`, `avatar`, `error`, `done`).
  - [ ] `frontend/src/components/rooms/RoomChatPage.test.tsx` for auto-scroll trigger behavior.

---

## Phase F - Docs + Regression Sweep

- [ ] Update `docs/CODE-REVIEW-GROUP-CHAT.md` statuses after implementation.
- [ ] Update `CHANGELOG.md` with parity improvements and new tests.
- [ ] If runtime_trigger rooms shipped, update user/dev docs:
  - [ ] `DOCUMENTATION.md` room chat request shape
  - [ ] optional note in `docs/planning/archive/P005-group-chat.md` as superseded behavior

---

## Codex/Claude CLI Execution Script (Recommended)

1. Implement Phase A completely + run targeted backend tests.
2. Implement Phase B + run targeted backend tests.
3. Implement Phase C + run targeted backend tests.
4. Implement Phase D + run targeted backend tests.
5. Implement Phase E backend first, then frontend, then run both suites.
6. Update docs in Phase F.

Use small, reviewable commits per phase. Do not mix backend and frontend refactors in one commit unless tests are already green for that phase.

---

## Validation Commands

```bash
# Backend targeted
backend/.venv/bin/python -m pytest -q backend/tests/test_rooms.py backend/tests/test_api.py

# Backend full (before merge)
backend/.venv/bin/python -m pytest -q backend/tests

# Frontend targeted (after adding room tests)
cd frontend && npx vitest run src/hooks/useRoomChat.test.tsx src/components/rooms/RoomChatPage.test.tsx

# Frontend full + build
cd frontend && npx vitest run && npm run build
```

---

## Acceptance Criteria (Definition of Done)

1. Same `(user_id, agent_id)` pair receives consistent emotional progression in both `/api/chat` and `/api/rooms/{room_id}/chat`.
2. Room chat validates game context with `GameContextRequest` and supports runtime-trigger semantics.
3. Room path has first-turn context, milestone persistence, response-size guard, and rollback-on-total-failure parity.
4. Room history compaction runs with existing compaction settings and summary behavior.
5. Room SSE provides avatar/emotion parity events without breaking existing `agent_done` consumers.
6. Frontend room chat handles new SSE events safely and auto-scrolls during active conversation.
7. New backend/frontend tests cover added parity and failure paths; full suites pass.

---

## Risks And Mitigations

1. **Risk:** Expanded router-to-router helper imports increase coupling.  
   **Mitigation:** Keep changes minimal for P011; if coupling grows further, extract shared helpers in follow-up P012.
2. **Risk:** Namespaced `session_id` for room events could surprise downstream analytics.  
   **Mitigation:** Use explicit `room:<room_id>` prefix and document contract in changelog/docs.
3. **Risk:** Added SSE events could break strict clients.  
   **Mitigation:** Additive only; existing events/payloads unchanged.
4. **Risk:** Compaction may summarize speaker attribution poorly in group chats.  
   **Mitigation:** Include `[sender_name]:` formatting in compaction input messages.
