# Game System Phase Tasks (Actionable)

**Date:** 2026-02-10  
**Source:** `FOUNDATION-PLAN.md`  
**Audience:** Coding agents implementing game-system hardening.

---

## How To Use

1. Complete phases in order unless explicitly marked parallel-safe.
2. Do not start game-specific expansion (chess/card) before Phase E.
3. For each task, commit small vertical slices with tests.
4. Keep feature-gated behind `GAMES_V2_ENABLED` until Phase E passes.

---

## Phase A - Backend Contracts and Data Foundations

**Goal:** Introduce authoritative game registry and typed contracts.

### A1. DB schema + migration
- [x] Add `game_registry` table in `backend/db/connection.py`.
- [x] Add `agent_game_config` table in `backend/db/connection.py`.
- [x] Add required indices in `backend/db/connection.py`.
- [x] Seed `tic-tac-toe` in `backend/db/seed.py` (or migration-safe bootstrap path).

### A2. Repository layer
- [x] Create `backend/db/repositories/games.py` with:
- [x] `list_registry()`, `get_registry(game_id)`, `create_registry_game()`, `update_registry_game()`, `deactivate_registry_game()`.
- [x] `list_agent_games(agent_id)`, `upsert_agent_game_config()`, `delete_agent_game_config()`.
- [x] Export repository in `backend/db/repositories/__init__.py`.

### A3. Typed schemas
- [x] Add `GameContextRequest` + nested enums/models in `backend/schemas/requests.py`.
- [x] Replace `ChatRequest.game_context: dict | None` with typed `GameContextRequest | None`.
- [x] Add response models for game catalog/config in `backend/schemas/responses.py`.

### A4. Routes
- [x] Add runtime routes in new `backend/routers/games.py`:
- [x] `GET /api/games/catalog`
- [x] `GET /api/games/catalog/{game_id}`
- [x] Add manage routes in `backend/routers/admin.py` or `backend/routers/manage_games.py`:
- [x] `GET/POST/PUT/DELETE /api/manage/games...`
- [x] `GET/PUT/DELETE /api/manage/agents/{agent_id}/games...`
- [x] Register new router(s) in `backend/main.py`.

### A5. Chat contract hardening
- [x] In `backend/routers/chat.py`, accept only typed game context fields.
- [x] Move prompt-instruction source to backend registry/config (do not trust raw client prompt text).
- [x] Enforce max lengths and enum validation paths.

### A6. Backend tests
- [x] Add tests in `backend/tests/test_api.py` for catalog and manage APIs.
- [x] Add tests in `backend/tests/test_game_context.py` for typed validation and rejections.
- [x] Add tests for per-agent game visibility and disabled-game rejection.

**Exit Criteria**
- [x] Agent-scoped catalog works.
- [x] Invalid game context gets `422`.
- [x] Manage APIs pass CRUD tests.

---

## Phase B - Frontend Catalog and Capability Gating

**Goal:** Only show/start games that backend allows for the selected agent.

### B1. API client
- [x] Add game catalog API methods in `frontend/src/utils/api.ts`:
- [x] `getGameCatalog()`, `getGameCatalogItem(gameId)`.
- [x] Add manage-game API methods for `/manage` UI.

### B2. Catalog store
- [x] Create `frontend/src/store/gameCatalogStore.ts`.
- [x] Store shape: `games`, `byId`, `loading`, `error`, `refresh(agentId)`.
- [x] Trigger refresh when `currentAgent` changes.

### B3. Runtime gating
- [x] Update `frontend/src/components/GameSelector.tsx` to use catalog store (not raw `listGames()`).
- [x] Update `frontend/src/hooks/useGame.ts` and/or `frontend/src/store/gameStore.ts` to block `startGame` if disabled.
- [x] Show clear UI reason when blocked (disabled/not configured).

### B4. Manage UI (first pass)
- [x] Extend `frontend/src/components/AdminPanel.tsx` with `Games` tab:
- [x] global game registry CRUD.
- [x] per-agent toggles/settings.

### B5. Frontend tests
- [ ] Add tests for selector filtering and start blocking.
- [ ] Add tests for catalog refresh on agent switch.

**Exit Criteria**
- [x] Disabled games are neither selectable nor startable.
- [x] Manage UI can enable/disable per agent.

---

## Phase C - Runtime Isolation and Session Scoping

**Goal:** Decouple game runtime side effects from normal chat/emotion history.

### C1. Message origin metadata
- [x] Extend message model in backend and frontend with `origin` (`user|assistant|game_runtime|system`).
- [x] Ensure synthetic game-turn/outcome prompts are marked `game_runtime`.

### C2. Chat/emotion separation
- [x] Update emotional processing path to ignore `game_runtime` origins by default.
- [x] Ensure compaction/history tooling can filter game-runtime prompts.

### C3. Game state persistence keys
- [x] Update `frontend/src/store/gameStore.ts` storage key to include:
- [x] `userId`, `agentId`, `sessionId`, `gameId`.
- [x] Clear or namespace state on session/agent switch.

### C4. useGame/useChat refactor
- [x] Stop relying on generic hidden user messages for runtime turn triggers.
- [x] Introduce explicit game-runtime send path (still text-only to LLM, no tools).

### C5. Tests
- [x] Add regression test for no cross-session leakage.
- [x] Add tests that game-runtime prompts do not appear as normal user chat entries.

**Exit Criteria**
- [x] Session switch never restores unrelated game state.
- [x] Emotion state is not unintentionally perturbed by synthetic runtime prompts.

---

## Phase D - Shared Game Window Shell UX

**Goal:** Unified draggable/minimizable/closable floating game planes.

### D1. Window shell components
- [ ] Add `frontend/src/games/ui/GameWindowShell.tsx`.
- [ ] Add `frontend/src/games/ui/GameWindowManager.tsx`.
- [ ] Move current game panel rendering into shell.

### D2. Window state store
- [ ] Add `frontend/src/store/gameWindowStore.ts`:
- [ ] position, z-index, minimized state, viewport bounds.

### D3. Interaction behavior
- [ ] Mouse drag and touch drag.
- [ ] Minimize/restore and close.
- [ ] Mobile-safe bounds + snap behavior.

### D4. Accessibility
- [ ] Keyboard-close and keyboard-minimize actions.
- [ ] Focus management when minimized/restored.

### D5. Tests
- [ ] Unit tests for store reducers.
- [ ] Component tests for drag bounds and minimize/restore lifecycle.

**Exit Criteria**
- [ ] Tic-tac-toe runs entirely inside shared shell.
- [ ] Window behavior is stable on desktop and mobile.

---

## Phase E - Loader Pipeline and Scale Readiness

**Goal:** Prepare for 20+ games without bloating initial load.

### E1. Module loaders
- [ ] Create `frontend/src/games/loaders/manifest.ts` (`gameId -> dynamic import`).
- [ ] Convert registry to metadata + lazy runtime loading.

### E2. Module packaging
- [ ] Move tic-tac-toe into `games/modules/tic-tac-toe/`.
- [ ] Ensure each module exports a consistent loader contract.

### E3. Performance guardrails
- [ ] Add build-size checks in CI or script.
- [ ] Verify inactive game engines are absent from initial chunk.

### E4. Next-game pilot
- [ ] Add chess as first heavy module through lazy loader path.
- [ ] Validate engine/rule behavior under strict mode.

### E5. Tests
- [ ] Loader success/failure tests.
- [ ] Preload-on-hover behavior tests.

**Exit Criteria**
- [ ] Initial app bundle remains stable while adding new games.
- [ ] Games load on-demand with acceptable latency.

---

## Phase F - Rollout and Cleanup

**Goal:** Safely switch from legacy game runtime to V2 foundation.

### F1. Feature flag rollout
- [ ] Add `GAMES_V2_ENABLED` checks in frontend + backend.
- [ ] Run internal A/B on selected agents first.

### F2. Data migration checks
- [ ] Verify existing sessions continue to function.
- [ ] Validate fallback behavior when no game config exists.

### F3. Remove legacy paths
- [ ] Decommission old global registry-only assumptions.
- [ ] Remove dead code/comments tied to legacy MVP flow.

### F4. Final verification
- [ ] Backend tests.
- [ ] Frontend tests.
- [ ] Manual E2E for agent/game enablement and window behavior.

**Exit Criteria**
- [ ] V2 path is default and stable.
- [ ] Legacy path can be removed or retained behind kill switch only.

---

## Recommended PR Breakdown

1. PR-1: Phase A schema + repositories + typed chat contract.
2. PR-2: Phase A/B routes + frontend catalog gating.
3. PR-3: Phase C runtime isolation + session scoping.
4. PR-4: Phase D shared window shell.
5. PR-5: Phase E lazy loaders + chess pilot.
6. PR-6: Phase F rollout cleanup.
