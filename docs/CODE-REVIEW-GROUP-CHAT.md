# Code Review Revalidation: Group Chat (Rooms)

**Original Review:** 2026-02-12  
**Revalidated Against Repo:** 2026-02-13  
**Implementation Update:** 2026-02-13 (P011 phases A-E completed)

---

## 1. Verdict

The previously open parity/safety findings from the 2026-02-12 review have been implemented.  
Room chat now follows the same user-agent continuity model as 1:1 chat for core runtime behavior.

### Risk Snapshot (Current)

| Severity | Open Items |
|----------|------------|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

---

## 2. Implemented Changes (Aligned To Original Findings)

1. **Validated room game context + runtime trigger support**
   - `RoomChatRequest.game_context` now uses `GameContextRequest`.
   - Room request model now supports `runtime_trigger`/`runtimeTrigger`.
   - Runtime-trigger messages are persisted as `origin='game_runtime'`.
   - Files: `backend/schemas/requests.py:380`, `backend/schemas/requests.py:381`, `backend/routers/rooms.py:568`

2. **Room first-turn context parity**
   - Room flow now calls `_build_first_turn_context(...)` per agent on first reply.
   - First-turn context is injected into the current user turn before game context injection.
   - Files: `backend/routers/rooms.py:602`, `backend/routers/rooms.py:758`

3. **Room workspace milestone parity**
   - Room replies now schedule `_ensure_workspace_milestones(...)` using the same user-agent state model.
   - Files: `backend/routers/rooms.py:674`, `backend/routers/rooms.py:980`

4. **Emotion log room correlation**
   - Room post-LLM emotion processing now passes `session_id=f"room:{room_id}"`.
   - Files: `backend/routers/rooms.py:664`, `backend/routers/rooms.py:970`

5. **Rollback safety for all-agent failures**
   - Non-stream and stream now delete the inserted room user message when no agent reply succeeds.
   - Files: `backend/routers/rooms.py:566`, `backend/routers/rooms.py:723`, `backend/routers/rooms.py:1068`

6. **Room SSE output guard**
   - Added `MAX_RESPONSE_CHARS` protection for both OpenClaw stream chunks and direct-mode final content.
   - File: `backend/routers/rooms.py:68`, `backend/routers/rooms.py:818`, `backend/routers/rooms.py:917`

7. **Room compaction implemented**
   - Added `_maybe_compact_room(room_id)` and background trigger after successful room responses.
   - Added room message repository helpers for compaction.
   - Files: `backend/routers/rooms.py:285`, `backend/routers/rooms.py:726`, `backend/routers/rooms.py:1070`, `backend/db/repositories/room_repository.py:461`

8. **Room SSE avatar/emotion event parity**
   - Room stream now emits `avatar` and `emotion` events per agent (additive; existing events unchanged).
   - Files: `backend/routers/rooms.py:1039`, `backend/routers/rooms.py:1049`

9. **Frontend room avatar + scroll parity**
   - `streamRoomChat` now parses `avatar` and `emotion` room events.
   - `useRoomChat` now applies avatar commands for the focused room agent.
   - Room page now auto-scrolls to the bottom as messages/streaming update.
   - Files: `frontend/src/utils/api.ts:833`, `frontend/src/hooks/useRoomChat.ts:83`, `frontend/src/components/rooms/RoomChatPage.tsx:91`

---

## 3. Test Coverage Added

### Backend

1. Runtime-trigger origin/history behavior in rooms.
2. First-turn context one-time behavior.
3. Workspace milestone scheduling in room flow.
4. Namespaced room emotion correlation ID.
5. Non-stream and stream rollback cleanup when all agents fail.
6. SSE truncation guard for oversized room responses.
7. Room stream `avatar` + `emotion` event emission.
8. Room compaction summary/pruning/disabled-mode behavior.

Reference: `backend/tests/test_rooms.py:458`, `backend/tests/test_rooms.py:561`, `backend/tests/test_rooms.py:1010`

### Frontend

1. Room hook avatar-event handling for focused agent.
2. Room chat page auto-scroll behavior.

References: `frontend/src/hooks/useRoomChat.test.tsx`, `frontend/src/components/rooms/RoomChatPage.test.tsx`

---

## 4. Remaining Follow-Ups (Non-Blocking)

1. Optional architecture cleanup: reduce router-to-router private helper imports by extracting shared chat/room parity helpers into a dedicated service module.
2. Optional product enhancement: multi-VRM room rendering (current focused-avatar behavior remains intentionally lightweight).
3. Optional platform hardening: per-user/per-room rate limiting for room chat cost control.

---

## 5. Conclusion

The prior room chat parity review is now implemented for the tracked functional gaps.  
Rooms and 1:1 chat now preserve the same user-agent bond continuity model for emotion drift, runtime trigger semantics, prompt injection safety, and compaction lifecycle.
