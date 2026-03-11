# Game System Foundation Plan (Post-MVP)

**Date:** 2026-02-10  
**Status:** Proposed  
**Scope:** Harden and scale the game system from MVP (`tic-tac-toe`) to a maintainable 20+ game platform.

---

## 1. Goals

1. Pluggable games with per-agent enable/disable and per-game settings.
2. Strong isolation: games do not destabilize core chat, VRM rendering, or emotion loops.
3. Rule-authoritative runtime: legal moves enforced, no accidental cheating.
4. Registry + deregistry with management UI and backend API.
5. Shared game window UX: draggable, minimizable, closable floating planes.
6. Scalable loading model: lazy-load heavy game engines/assets on demand.
7. Simple, modular implementation that coding agents can extend safely.

---

## 2. Current Gaps (Observed)

1. Global static registry enables all games for all agents.
2. Game state persistence is global (not scoped by user/agent/session).
3. Auto-generated game prompts currently flow through normal chat path and can affect history/emotion behavior.
4. Backend accepts untyped/unbounded `game_context` payload.
5. No backend game catalog or agent-game configuration model.
6. No shared draggable/minimizable game shell; current panel is fixed-position.
7. No lazy-loading strategy for many game modules and engines.

---

## 3. Architecture Principles

1. **Control plane vs runtime plane**: configuration APIs are separate from live move runtime.
2. **Server is source of truth for capability**: frontend only starts games allowed for the active agent.
3. **Runtime remains frontend-first**: game logic stays in browser, backend validates contracts and access.
4. **LLM remains narration/personality layer**: no tools; text tags only (`[move:x]`, `[game:action]`).
5. **Strict interfaces, versioned contracts**: every game module and API payload has a schema version.
6. **Fail-safe defaults**: invalid/missing move falls back to legal deterministic behavior.

---

## 4. Target Architecture

### 4.1 Control Plane (Backend)

Add explicit game catalog and per-agent capability model.

**Core entities**
- `game_registry`: all known game modules (metadata, status, loader key, rule mode).
- `agent_game_config`: per-agent toggles and overrides (enabled, mode, difficulty, prompt override).

**Effective enabled games**
- `effective_games(agent) = game_registry.active AND agent_game_config.enabled AND workspace_support(agent, game)`
- `workspace_support` can be strict (`required`) or advisory (`warn-only`) per env flag.

### 4.2 Runtime Plane (Frontend)

Split current game runtime into:
- `GameCatalogStore`: server-provided games for current agent.
- `GameRuntimeStore`: active sessions, moves, state, turn, statuses.
- `GameWindowStore`: window geometry, z-order, minimized state.

### 4.3 LLM Integration Plane

Introduce a typed game context envelope:

```json
{
  "version": "1",
  "game_id": "tic-tac-toe",
  "turn": "avatar",
  "state_text": "...",
  "last_user_move": "5",
  "avatar_move": null,
  "valid_moves": ["1", "3", "7"],
  "status": "in_progress",
  "mode": "interactive"
}
```

Backend injects prompt text from server-known game config, not arbitrary client prompt strings.

### 4.4 Presentation Plane

Create shared `GameWindowShell`:
- draggable (mouse + touch),
- minimizable,
- closable,
- bounded to viewport,
- persisted per session/game.

Each game renderer mounts inside this shell.

---

## 5. Data Model and Migration

### 5.1 New Tables

```sql
CREATE TABLE IF NOT EXISTS game_registry (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  module_key TEXT NOT NULL,            -- frontend loader key
  active INTEGER NOT NULL DEFAULT 1,   -- global on/off
  move_provider_default TEXT NOT NULL, -- llm|engine|random
  rule_mode TEXT NOT NULL DEFAULT 'strict', -- strict|narrative|spectator
  version TEXT NOT NULL DEFAULT '1',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS agent_game_config (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT DEFAULT NULL,              -- optional override
  difficulty REAL DEFAULT NULL,        -- optional override
  prompt_override TEXT DEFAULT NULL,   -- optional constrained override
  workspace_required INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (agent_id, game_id)
);
```

### 5.2 Optional Table (Future)

`game_runtime_events` for analytics/debug only; do not block MVP hardening on this.

### 5.3 Migration Notes

1. Seed `game_registry` with `tic-tac-toe`.
2. Backfill `agent_game_config` rows as disabled by default, then enable only where intended.
3. Add indices:
   - `idx_agent_game_config_agent`
   - `idx_game_registry_active`

---

## 6. Backend API Plan

### 6.1 Public Runtime APIs

1. `GET /api/games/catalog`
   - returns effective enabled games for current `X-Agent-Id`.
2. `GET /api/games/catalog/{game_id}`
   - returns metadata/config for active agent + game.

### 6.2 Manage APIs

1. `GET /api/manage/games`
2. `POST /api/manage/games`
3. `PUT /api/manage/games/{game_id}`
4. `DELETE /api/manage/games/{game_id}` (soft-delete `active=0` first)
5. `GET /api/manage/agents/{agent_id}/games`
6. `PUT /api/manage/agents/{agent_id}/games/{game_id}`
7. `DELETE /api/manage/agents/{agent_id}/games/{game_id}`

### 6.3 Chat Contract Hardening

Replace `game_context: dict | None` with typed model:
- max lengths (`state_text`, `valid_moves`, etc.),
- enum validation for `status`/`turn`/`mode`,
- reject unknown keys.

Backend-side prompt assembly:
- pull per-game instructions from trusted registry/config,
- append validated state only,
- never trust raw client `promptInstructions`.

---

## 7. Frontend Refactor Plan

### 7.1 New File Structure

```text
frontend/src/games/
  core/
    contracts.ts
    runtime.ts
    catalog.ts
    windowStore.ts
    runtimeStore.ts
  modules/
    tic-tac-toe/
      index.ts
      module.ts
      renderer.tsx
  loaders/
    manifest.ts           # gameId -> dynamic import()
  ui/
    GameWindowShell.tsx
    GameWindowManager.tsx
    GameLauncher.tsx
```

### 7.2 Loader Strategy

1. Use dynamic imports per game module.
2. Preload on hover/focus in game launcher.
3. Keep shell + registry lightweight in initial bundle.
4. Load heavy engines (chess/card libs) only when game starts.

### 7.3 Runtime Rules

1. `GameRuntime` must expose `getValidMoves` and `applyMove` with strict validation.
2. If LLM move is illegal/missing:
   - fallback to deterministic legal move,
   - emit warning event (debug panel),
   - never mutate state illegally.

### 7.4 Session Scoping

Persist runtime state key by:
- `userId + agentId + sessionId + gameId`

Switching session/agent clears unrelated game runtime state.

---

## 8. Isolation From Main Chat/Emotion/VRM Loops

1. Add message origin metadata: `origin = user|system|game_runtime`.
2. Game-triggered turn prompts/outcome reactions should be marked `game_runtime`.
3. Emotion processing should ignore `game_runtime` by default (configurable).
4. Chat history compaction should optionally exclude synthetic game runtime prompts.
5. VRM animation remains tag-driven; no direct coupling to game logic internals.

---

## 9. Game Window UX Spec

`GameWindowShell` required behaviors:
1. Drag handle area in header.
2. Minimize button (collapsed header only).
3. Close button (ends runtime session, does not delete stats).
4. Keyboard accessibility for close/minimize.
5. Mobile behavior:
   - bounded drag region,
   - snap to top/center presets,
   - preserve usable chat/input areas.

Shared shell props:
- `title`, `subtitle`, `statusChip`, `onClose`, `onMinimize`, `isMinimized`, `zIndex`.

---

## 10. Phased Implementation Plan (LLM-Agent Friendly)

### Phase A - Contract and Data Foundations

1. Add DB tables + repository methods.
2. Add Pydantic models for game catalog and typed game context.
3. Add manage + public game routes.
4. Add backend tests for permission, validation, and effective catalog resolution.

**Acceptance**
- Catalog is returned per active agent.
- Invalid game context is rejected with 422.

### Phase B - Frontend Catalog and Gating

1. Add `GameCatalogStore` and fetch from `/api/games/catalog`.
2. Update launcher to show only effective games.
3. Block `startGame` if game not enabled for current agent.

**Acceptance**
- Disabled game cannot be started from UI or direct call path.

### Phase C - Runtime and Isolation Hardening

1. Split runtime from current `useGame`.
2. Add message origin metadata and emotion exclusion for game runtime messages.
3. Scope game persistence by user/agent/session/game.
4. Remove hidden synthetic prompts from normal history path or mark them explicitly.

**Acceptance**
- Session switch cannot leak active game state.
- Game runtime events do not pollute regular user conversation history unintentionally.

### Phase D - Shared Window System

1. Implement `GameWindowShell` and manager.
2. Add drag/minimize/close with persistence.
3. Move existing `GamePanel` renderer into shell.

**Acceptance**
- Tic-tac-toe runs inside new shell with all controls.

### Phase E - Lazy Loading + Multi-Game Readiness

1. Add loader manifest with dynamic imports.
2. Move tic-tac-toe to loader pipeline.
3. Add performance checks for initial bundle and game chunk sizes.

**Acceptance**
- Initial JS bundle does not include inactive game engines.

---

## 11. Testing Matrix

### Backend

1. Catalog resolution by agent + workspace capability.
2. CRUD on game registry and agent-game config.
3. Chat request game context validation bounds and enums.
4. Prompt injection guard tests (reject unknown/oversized fields).

### Frontend

1. Store tests: start/stop/move/session-scope persistence.
2. Catalog gating tests: only enabled games visible/startable.
3. Window shell tests: drag bounds, minimize/restore, close lifecycle.
4. Loader tests: dynamic import path and fallback error state.

### E2E

1. Enabled game path: start -> move -> avatar move -> finish.
2. Disabled game path: not visible and blocked on direct action.
3. Session switch path: no cross-session state leakage.

---

## 12. Rollout Strategy

1. Rollout by optional agent cohort using `GAMES_V2_AGENT_ALLOWLIST`.
2. Keep current `tic-tac-toe` path as fallback until Phase D complete.
3. Migrate one game first (`tic-tac-toe`), then add chess.
4. Enable per-agent gradually via manage UI.

---

## 13. Definition of Done

1. Agent-specific game enablement works end-to-end.
2. Shared draggable/minimizable game shell is in production path.
3. Typed and validated backend game context contract is enforced.
4. No cross-session game state leakage.
5. Lazy loading is active for game modules/engines.
6. Test coverage includes runtime, API contracts, and E2E critical paths.
