# P012: Shared Chat Runtime Extraction + Room Multi-VRM Rendering

**Status:** Proposed  
**Created:** 2026-02-13  
**Owner:** Backend + Frontend follow-up after P011 parity completion

## Goal

Complete two non-blocking follow-ups from room parity work:

1. Remove router-to-router coupling by extracting shared chat/room helper logic into service modules.
2. Add multi-VRM room rendering so multiple room agents are visible and reactive in room chat.

---

## Current Repo Baseline (2026-02-13)

1. `backend/routers/rooms.py` imports private helpers from `backend/routers/chat.py`:
   - `_build_first_turn_context`
   - `_ctx_value`
   - `_ensure_workspace_milestones`
   - `_process_emotion_pre_llm`
   - `_process_emotion_post_llm`
   - `_resolve_trusted_prompt_instructions`
   - `_safe_get_mood_snapshot`
   - `_spawn_background`
   - `inject_game_context`
2. Room SSE already emits `avatar` and `emotion` events; frontend parses them (`frontend/src/utils/api.ts`) and `useRoomChat` applies avatar behavior only to focused agent.
3. `RoomChatPage` still has a placeholder panel (`"VRM hidden by default in room mode."`) and no multi-avatar renderer.
4. `useAppStore` currently manages a single global `avatarRenderer` for 1:1 chat mode.

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

- [ ] Create `backend/services/chat_context_runtime.py` with shared helpers moved out of router code:
  - [ ] `ctx_value(...)` (from `_ctx_value`)
  - [ ] `resolve_trusted_prompt_instructions(...)`
  - [ ] `inject_game_context(...)`
  - [ ] `build_first_turn_context(...)`
  - [ ] `ensure_workspace_milestones(...)`
  - [ ] `safe_get_mood_snapshot(...)`
- [ ] Keep temporary compatibility wrappers in `backend/routers/chat.py` to avoid breakage during migration.
- [ ] Update `backend/routers/rooms.py` to import from `services.chat_context_runtime`, not `routers.chat`.

### Tests

- [ ] Keep existing behavior tests passing (`backend/tests/test_rooms.py`, `backend/tests/test_api.py`).
- [ ] Add focused unit test(s) for `chat_context_runtime.py` pure helper behavior where practical.

---

## Phase B - Extract Emotion + Background Task Runtime

### Backend

- [ ] Create `backend/services/emotion_runtime.py`:
  - [ ] move `_get_emotion_lock(...)`
  - [ ] move `_process_emotion_pre_llm(...)`
  - [ ] move `_process_emotion_post_llm(...)`
- [ ] Create `backend/services/background_tasks.py`:
  - [ ] move `_spawn_background(...)` and background task registry.
- [ ] Update imports in:
  - [ ] `backend/routers/chat.py`
  - [ ] `backend/routers/rooms.py`
- [ ] Remove router-to-router import dependency entirely.

### Compatibility Notes

- [ ] Keep thin wrapper aliases in `routers/chat.py` for one transition phase so existing patch-based tests can be migrated safely.
- [ ] Update test patch targets from `routers.chat.*` / `routers.rooms.*` to new service module paths once stable.

### Tests

- [ ] Full backend tests:
  - [ ] `backend/.venv/bin/python -m pytest -q backend/tests/test_rooms.py backend/tests/test_api.py`
  - [ ] `backend/.venv/bin/python -m pytest -q backend/tests`

---

## Phase C - Backend Cleanup + Contract Guard

### Backend

- [ ] Remove temporary wrappers once tests are updated.
- [ ] Ensure no non-chat router imports private chat router helpers:
  - [ ] `rg -n "from routers\\.chat import" backend/routers`
- [ ] Keep chat and room behavior unchanged (no payload/schema drift).

### Docs

- [ ] Update `DOCUMENTATION.md` backend architecture notes with the new service modules.

---

## Phase D - Room Avatar State Model (Per-Agent)

### Frontend Store/Hook

- [ ] Extend `frontend/src/store/roomStore.ts` with per-agent avatar runtime state:
  - [ ] `avatarCommandByAgent: Record<string, AvatarCommand>`
  - [ ] `lastAvatarEventAtByAgent: Record<string, number>`
  - [ ] actions:
    - [ ] `setAgentAvatarCommand(agentId, command, ts)`
    - [ ] `clearAgentAvatarCommand(agentId)`
    - [ ] `resetRoomAvatars()`
- [ ] Update `frontend/src/hooks/useRoomChat.ts`:
  - [ ] Always persist `avatar` SSE events into room store per agent.
  - [ ] Preserve focused-agent bridge to `useAppStore().applyAvatarCommand(...)` for backward compatibility.

### Tests

- [ ] Add/extend tests for room avatar state updates in hook/store tests.

---

## Phase E - Multi-VRM Room Components

### Frontend Components

- [ ] Add `frontend/src/components/rooms/RoomAvatarTile.tsx`:
  - [ ] Encapsulate one `AvatarRenderer` instance.
  - [ ] Load `vrm_model` per room agent (`/vrm/<model>` fallback `emilia.vrm`).
  - [ ] Apply incoming avatar command to renderer behavior controller.
  - [ ] Clean up renderer on unmount.
- [ ] Add `frontend/src/components/rooms/RoomAvatarStage.tsx`:
  - [ ] Render a responsive grid/rail of room agents.
  - [ ] Use `focusedAgentId` + recency (`lastAvatarEventAtByAgent`) to choose active renderers.
  - [ ] Enforce active renderer cap (desktop 4, mobile 2).
  - [ ] For overflow agents, render lightweight static cards (name/status, no live WebGL).
- [ ] Reuse `frontend/src/avatar/preloadVRM.ts` for preloading visible/focused models.

### Performance Guardrails

- [ ] Disable orbit controls in room avatar tiles.
- [ ] Honor quality settings from `useRenderStore`.
- [ ] Avoid mounting all renderers at once when room has many agents.

---

## Phase F - Integrate Multi-VRM Stage Into Room UI

### Frontend Page

- [ ] Update `frontend/src/components/rooms/RoomChatPage.tsx`:
  - [ ] Replace placeholder focused-avatar panel with `RoomAvatarStage`.
  - [ ] Keep message click -> `setFocusedAgent(...)`.
  - [ ] Keep current mention workflow and auto-scroll behavior unchanged.
- [ ] Add empty/loading/error states for avatar stage:
  - [ ] no agents
  - [ ] VRM load failure
  - [ ] WebGL unsupported fallback message

### UX Notes

- [ ] Focused agent should render in a primary tile style.
- [ ] Agent currently streaming should show a lightweight "speaking/thinking" indicator.

---

## Phase G - Frontend Tests + Build Validation

### Tests

- [ ] Update `frontend/src/hooks/useRoomChat.test.tsx`:
  - [ ] verify per-agent avatar command persistence
  - [ ] verify focused-agent bridge behavior is preserved
- [ ] Add `frontend/src/components/rooms/RoomAvatarStage.test.tsx`:
  - [ ] renderer cap behavior
  - [ ] focus prioritization
  - [ ] overflow fallback rendering
- [ ] Update `frontend/src/components/rooms/RoomChatPage.test.tsx` for new avatar stage rendering.

### Validation

- [ ] `cd frontend && npx vitest run`
- [ ] `cd frontend && npm run build`

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
