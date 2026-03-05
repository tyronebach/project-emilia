# P012: Shared Chat Runtime Extraction + Room Multi-VRM Rendering

**Status:** Implemented (Phases A-G complete)  
**Created:** 2026-02-13  
**Updated:** 2026-02-13  
**Owner:** Backend + Frontend follow-up after P011 parity completion

## Goal

Complete two non-blocking follow-ups from room parity work:

1. Remove router-to-router coupling by extracting shared chat/room helper logic into service modules.
2. Add multi-VRM room rendering so multiple room agents are visible and reactive in room chat.

---

## Outcome Snapshot (2026-02-13)

1. Shared chat/room runtime helpers are extracted into:
   - `backend/services/chat_context_runtime.py`
   - `backend/services/emotion_runtime.py`
   - `backend/services/background_tasks.py`
2. `backend/routers/rooms.py` no longer imports from `backend/routers/chat.py`.
3. Room avatar events are persisted per agent in `frontend/src/store/roomStore.ts`.
4. Multi-VRM room UI is shipped:
   - `frontend/src/components/rooms/RoomAvatarStage.tsx`
   - `frontend/src/components/rooms/RoomAvatarTile.tsx`
5. `RoomChatPage` now renders the room avatar stage with fallback states and focus controls.
6. Frontend coverage includes `RoomAvatarStage` cap/focus/overflow tests.

---

## Locked Decisions

1. Keep request/response contracts unchanged for existing room APIs and SSE event names.
2. Reuse existing renderer/runtime primitives (`AvatarRenderer`, `useRenderStore`, `preloadVRM`) instead of introducing a second avatar engine.
3. Keep 1:1 avatar behavior unchanged in `App.tsx` + `AvatarPanel.tsx`.
4. Cap active room renderers for safety (desktop 4, mobile 2) with graceful fallback for non-rendered agents.
5. Deliver this as phased, reviewable commits (one commit per phase).

---

## Scope

### In Scope

1. Backend service extraction to remove `rooms.py` dependency on private `chat.py` internals.
2. Frontend room multi-VRM stage, focus interactions, and avatar-event routing per agent.
3. Test updates for backend refactor and new frontend room rendering behavior.

### Out of Scope

1. Multi-user synchronized avatar scenes or shared camera networking.
2. Full lip-sync/TTS playback for all room avatars simultaneously.
3. New DB schema or API changes for room chat parity.
4. Rewriting the core `AvatarRenderer` architecture.

---

## Implementation Plan

## Phase A - Extract Shared Chat Context Helpers

### Backend

- [x] Create `backend/services/chat_context_runtime.py` with shared helpers moved out of router code:
  - [x] `ctx_value(...)` (from `_ctx_value`)
  - [x] `resolve_trusted_prompt_instructions(...)`
  - [x] `inject_game_context(...)`
  - [x] `build_first_turn_context(...)`
  - [x] `ensure_workspace_milestones(...)`
  - [x] `safe_get_mood_snapshot(...)`
- [x] Keep temporary compatibility wrappers in `backend/routers/chat.py` to avoid breakage during migration.
- [x] Update `backend/routers/rooms.py` to import from `services.chat_context_runtime`, not `routers.chat`.

### Tests

- [x] Keep existing behavior tests passing (`backend/tests/test_rooms.py`, `backend/tests/test_api.py`).
- [x] Cover shared helper behavior through existing chat/room/game-context backend tests during extraction.

---

## Phase B - Extract Emotion + Background Task Runtime

### Backend

- [x] Create `backend/services/emotion_runtime.py`:
  - [x] move `_get_emotion_lock(...)`
  - [x] move `_process_emotion_pre_llm(...)`
  - [x] move `_process_emotion_post_llm(...)`
- [x] Create `backend/services/background_tasks.py`:
  - [x] move `_spawn_background(...)` and background task registry.
- [x] Update imports in:
  - [x] `backend/routers/chat.py`
  - [x] `backend/routers/rooms.py`
- [x] Remove router-to-router import dependency entirely.

### Compatibility Notes

- [x] Kept thin wrapper aliases in `routers/chat.py` for one transition phase during migration.
- [x] Preserved existing test patch targets (`routers.chat.*` / `routers.rooms.*`) by importing shared runtime helpers under the existing router-level names.

### Tests

- [x] Full backend tests:
  - [x] `backend/.venv/bin/python -m pytest -q backend/tests/test_rooms.py backend/tests/test_api.py`
  - [x] `backend/.venv/bin/python -m pytest -q backend/tests`

---

## Phase C - Backend Cleanup + Contract Guard

### Backend

- [x] Remove temporary wrappers once tests are updated.
- [x] Ensure no non-chat router imports private chat router helpers:
  - [x] `rg -n "from routers\\.chat import" backend/routers`
- [x] Keep chat and room behavior unchanged (no payload/schema drift).

### Docs

- [x] Update `DOCUMENTATION.md` backend architecture notes with the new service modules.

---

## Phase D - Room Avatar State Model (Per-Agent)

### Frontend Store/Hook

- [x] Extend `frontend/src/store/roomStore.ts` with per-agent avatar runtime state:
  - [x] `avatarCommandByAgent: Record<string, AvatarCommand>`
  - [x] `lastAvatarEventAtByAgent: Record<string, number>`
  - [x] actions:
    - [x] `setAgentAvatarCommand(agentId, command, ts)`
    - [x] `clearAgentAvatarCommand(agentId)`
    - [x] `resetRoomAvatars()`
- [x] Update `frontend/src/hooks/useRoomChat.ts`:
  - [x] Always persist `avatar` SSE events into room store per agent.
  - [x] Preserve focused-agent bridge to `useAppStore().applyAvatarCommand(...)` for backward compatibility.

### Tests

- [x] Add/extend tests for room avatar state updates in hook/store tests.

---

## Phase E - Multi-VRM Room Components

### Frontend Components

- [x] Add `frontend/src/components/rooms/RoomAvatarTile.tsx`:
  - [x] Encapsulate one `AvatarRenderer` instance.
  - [x] Load `vrm_model` per room agent (`/vrm/<model>` fallback `emilia.vrm`).
  - [x] Apply incoming avatar command to renderer behavior controller.
  - [x] Clean up renderer on unmount.
- [x] Add `frontend/src/components/rooms/RoomAvatarStage.tsx`:
  - [x] Render a responsive grid/rail of room agents.
  - [x] Use `focusedAgentId` + recency (`lastAvatarEventAtByAgent`) to choose active renderers.
  - [x] Enforce active renderer cap (desktop 4, mobile 2).
  - [x] For overflow agents, render lightweight static cards (name/status, no live WebGL).
- [x] Reuse `frontend/src/avatar/preloadVRM.ts` for preloading visible/focused models.

### Performance Guardrails

- [x] Disable orbit controls in room avatar tiles.
- [x] Honor quality settings from `useRenderStore`.
- [x] Avoid mounting all renderers at once when room has many agents.

---

## Phase F - Integrate Multi-VRM Stage Into Room UI

### Frontend Page

- [x] Update `frontend/src/components/rooms/RoomChatPage.tsx`:
  - [x] Replace placeholder focused-avatar panel with `RoomAvatarStage`.
  - [x] Keep message click -> `setFocusedAgent(...)`.
  - [x] Keep current mention workflow and auto-scroll behavior unchanged.
- [x] Add empty/loading/error states for avatar stage:
  - [x] no agents
  - [x] VRM load failure
  - [x] WebGL unsupported fallback message

### UX Notes

- [x] Focused agent should render in a primary tile style.
- [x] Agent currently streaming should show a lightweight "speaking/thinking" indicator.

---

## Phase G - Frontend Tests + Build Validation

### Tests

- [x] Update `frontend/src/hooks/useRoomChat.test.tsx`:
  - [x] verify per-agent avatar command persistence
  - [x] verify focused-agent bridge behavior is preserved
- [x] Add `frontend/src/components/rooms/RoomAvatarStage.test.tsx`:
  - [x] renderer cap behavior
  - [x] focus prioritization
  - [x] overflow fallback rendering
- [x] Update `frontend/src/components/rooms/RoomChatPage.test.tsx` for new avatar stage rendering.

### Validation

- [x] `cd frontend && npx vitest run`
- [x] `cd frontend && npm run build`

---

## Execution Order (Codex/Claude CLI)

1. Phase A commit
2. Phase B commit
3. Phase C commit
4. Phase D commit
5. Phase E commit
6. Phase F commit
7. Phase G commit

Do not combine backend refactor and frontend multi-VRM implementation in one commit.

---

## Acceptance Criteria

1. `backend/routers/rooms.py` no longer imports private helpers from `backend/routers/chat.py`.
2. Shared helper logic lives in service modules with backend tests green.
3. Room chat can display multiple agent VRMs concurrently with controlled renderer caps.
4. Room `avatar` SSE signals drive per-agent renderer behavior updates.
5. Focused agent UX still works and remains compatible with existing single-avatar command flow.
6. Full frontend test suite and build pass after integration.

---

## Risks And Mitigations

1. **Risk:** Refactor breaks patch-based tests due moved import paths.  
   **Mitigation:** Keep transition wrappers until tests are migrated.
2. **Risk:** GPU/CPU load with many room agents.  
   **Mitigation:** hard caps, overflow fallback cards, quality settings reuse.
3. **Risk:** Renderer lifecycle leaks (WebGL contexts not disposed).  
   **Mitigation:** strict mount/unmount cleanup in `RoomAvatarTile` + targeted tests.
4. **Risk:** Behavior drift while moving emotion helpers from router to service.  
   **Mitigation:** pure move first, no logic change, run full backend suite before cleanup.
