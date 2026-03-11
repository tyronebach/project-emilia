# Emilia Webapp - Deep Code Review

**Date**: 2026-02-11
**Scope**: Full codebase audit focusing on group chat, emotion engine, designer-v2, games modules, and overall architecture.
**Goal**: Identify dead code, simplification opportunities, modularity improvements, and LLM-agent maintainability.

---

## Executive Summary

The codebase is well-structured with clean separations: modular routers, Zustand stores with clear responsibilities, lazy-loaded game modules, and a comprehensive designer tool. The newest features (group rooms, drift simulator, games v2) are production-quality. However, there are concrete opportunities to **delete dead code**, **consolidate duplicated patterns**, and **simplify the emotion engine** - all of which will reduce maintenance burden and make the codebase more friendly to LLM coding agents.

**Key numbers**:
- ~3 dead config values, ~5 dead DB columns, 1 dead DB table, 1 dead hook to delete
- ~6 duplicated patterns to consolidate into shared utilities
- Emotion engine has 3 incomplete V2 features that should be finished or removed
- Version string is out of sync (README, backend, changelog)
- Test coverage gaps in critical paths (hooks, repositories, streaming)

---

## 1. Dead Code to Delete

### 1.1 Backend Dead Code

| Item | Location | Why it's dead |
|------|----------|---------------|
| `trigger_classifier_enabled` config | `backend/config.py` | Never referenced by any code |
| `trigger_classifier_confidence` config | `backend/config.py` | Never referenced by any code |
| `clawdbot_agents_dir` config | `backend/config.py` | Defined but never used anywhere |
| `emotional_events` table (V1) | `backend/db/connection.py` | Only V2 table is used; V1 never written to |
| 5 dead columns on `emotional_state` | `backend/db/connection.py` | `inferred_user_valence`, `inferred_user_arousal`, `relationship_type`, `relationship_config`, `relationship_started_at` - never written to |
| `RoomRepository.add_participant()` | `backend/db/repositories/room_repository.py` | Defined but never called; room creation does inline insert |
| `detect_triggers_llm()` | `backend/services/emotion_engine.py` | Fully implemented but never called from any router or service |
| `detect_triggers_llm_batch()` | `backend/services/emotion_engine.py` | Same - orphaned LLM trigger detection |
| `DIMENSION_UPDATES` mapping | `backend/services/emotion_engine.py` | Static mapping defined but never referenced in the trigger application path |
| Unused import `File` | `backend/routers/chat.py:3` | Imported but only `UploadFile` is used |
| Unused import `bad_request` | `backend/routers/chat.py:13` | Imported but errors use `HTTPException` directly |

**Action**: Delete all of the above. No legacy support needed.

### 1.2 Frontend Dead Code

| Item | Location | Why it's dead |
|------|----------|---------------|
| `useTTS` hook | `frontend/src/hooks/useTTS.ts` | Exported in index.ts but never imported anywhere; TTS logic lives inline in `useChat.ts` |
| `moveHistory` prop on `GameRendererProps` | `frontend/src/games/types.ts:120` | Passed to all game renderers but neither ChessBoard nor TicTacToeBoard reads it |
| Duplicate `POSITION_LABELS` | `frontend/src/games/modules/tic-tac-toe/TicTacToeBoard.tsx:5` | Identical constant already in TicTacToeModule.ts |
| Unused `AtSign` import | Room chat page | Imported but never rendered |
| `rule_mode` from game catalog API | `useGameCatalogStore` | Fetched from backend but never used in frontend logic |

**Action**: Delete `useTTS.ts` and its export. Remove `moveHistory` from GameRendererProps. Export and reuse POSITION_LABELS. Remove unused imports.

---

## 2. Duplicated Patterns to Consolidate

### 2.1 Backend Duplication

**Pattern 1: Mood weights JSON parsing** (3+ locations)
```python
# Repeated in: routers/designer_v2.py, routers/emotional.py, routers/chat.py
raw_mw = state_row.get("mood_weights_json")
try:
    mood_weights = json.loads(raw_mw) if isinstance(raw_mw, str) else raw_mw
except (json.JSONDecodeError, TypeError):
    mood_weights = {}
```
**Fix**: Extract to `EmotionalStateRepository.get_mood_weights(user_id, agent_id) -> dict`.

**Pattern 2: Profile JSON parsing** (2+ locations)
```python
# Repeated in: routers/designer_v2.py, routers/emotional.py
def _parse_profile(raw): ...
```
**Fix**: Move to `AgentRepository.get_parsed_profile(agent_id) -> dict`.

**Pattern 3: Behavior extraction in rooms** (duplicated between stream and non-stream paths)
- `_message_behavior()` and `_room_message_row()` in `routers/rooms.py` both extract the same behavior fields
- Both streaming and non-streaming paths duplicate LLM message building
**Fix**: Extract `_extract_behavior_dict()` shared helper.

**Pattern 4: Emotion processing** (shared between chat and rooms)
- `_process_emotion_pre_llm()` and `_process_emotion_post_llm()` imported from chat.py into rooms.py
- This coupling is acceptable but could become a `services/emotion_pipeline.py` module.

**Pattern 5: Mood injection settings clamping** (2 locations)
- Same clamping logic in `emotion_engine.py` and `designer_v2.py`
**Fix**: Single `clamp_injection_settings()` function.

### 2.2 Frontend Duplication

**Pattern 1: Select + Label UI** (12+ instances across designer tabs)
```tsx
<div>
  <label className="block text-xs text-text-secondary mb-1">Label</label>
  <select className="w-full bg-bg-tertiary border border-white/10 rounded-lg...">{options}</select>
</div>
```
**Fix**: Extract `<SelectField>` component.

**Pattern 2: Stats grid** (CalibrationCard, DriftSimulatorTab)
**Fix**: Extract `<StatsGrid>` component.

**Pattern 3: `getCategoryForTrigger()`** (3 files: CalibrationCard, TriggerBadge, CalibrationHeatmap)
**Fix**: Single export from `utils/designer-helpers.ts`.

**Pattern 4: Color mappings** (4+ locations: CATEGORY_COLORS, PRESET_COLORS, BOND_COLORS)
**Fix**: Consolidate to `constants/designer-colors.ts`.

**Pattern 5: Percentage clamping** (`Math.max(0, Math.min(100, value * 100))` in 5+ places)
**Fix**: `percentClamp()` utility.

---

## 3. Emotion Engine Issues

The emotion engine (`backend/services/emotion_engine.py`) is the most complex backend module. Several V2 features are partially implemented:

### 3.1 Incomplete Features (Finish or Remove)

| Feature | Status | Action |
|---------|--------|--------|
| Relationship dimension updates | `update_relationship_dimensions()` exists, `DIMENSION_UPDATES` defined, but never called from chat flow | **Either wire into chat pipeline or delete** |
| Trigger calibration persistence | `learn_from_outcome()` returns updated calibrations but they're **never saved to DB** | **Wire `update_calibration_json()` after learning, or remove** |
| Outcome inference | `infer_outcome_multisignal()` exists but only used in tests, never in chat flow | **Integrate or delete** |
| Drift simulator learning | Drift simulator doesn't use `learn_from_outcome()` or calibration system | **Integrate for accuracy or document as "simplified model"** |

### 3.2 Complexity to Simplify

**Trigger delta resolution** (`get_trigger_deltas()`, ~60 lines): Multi-level fallback chain (trigger_responses -> preset multipliers -> trigger_multipliers -> DEFAULT_TRIGGER_DELTAS). Pre-compute effective deltas during profile initialization instead.

**Mood injection volatility selection** (~80 lines): Multiple magic numbers (0.3, 0.7, 0.6, 1.2). Extract to `MoodInjectionStrategy` class with named constants.

**Axis clamping** (repeated 15+ times): Same `_clamp()` calls with hardcoded min/max. Define `AXIS_BOUNDS` dict and loop.

### 3.3 Type Safety

- `trigger_calibration` field is typed as `dict` but at runtime contains mixed `dict | ContextualTriggerCalibration` objects
- Broad `except Exception` catches (5+ locations) swallow classifier initialization errors silently
- `SimulationTriggerDetail` frontend type expects `dna_sensitivity` and `calibration_multiplier` fields that the backend **never returns** - UI shows `undefined`

---

## 4. Group Chat (Rooms) Issues

### 4.1 Validation Gaps

| Issue | Location | Fix |
|-------|----------|-----|
| `CreateRoomRequest.agent_ids` max 10, but `DEFAULT_ROOM_SETTINGS.max_agents` is 5 | `schemas/requests.py` vs `room_repository.py` | Align to single constant |
| `mention_agents` not validated against actual room agents | `routers/rooms.py` | Add room-agent membership check |
| Frontend `RoomAgent.role` typed as `string` | `frontend/src/utils/api.ts` | Use `'participant' \| 'moderator' \| 'observer'` literal |
| Frontend `RoomAgent.response_mode` typed as `string` | `frontend/src/utils/api.ts` | Use `'mention' \| 'always' \| 'manual'` literal |

### 4.2 Missing Features

- **Room compaction**: Schema columns exist (`summary`, `compaction_count`) and repository methods are defined but never wired to router
- **Streaming abort on unmount**: `useRoomChat` has `abortControllerRef` but RoomChatPage doesn't abort on component unmount
- **`RoomRepository.get_agents()` called twice** in room chat endpoint - minor inefficiency

### 4.3 Error Handling

- Multi-agent room chat: if one agent fails, the loop continues but doesn't clean up partial responses
- Room creation errors logged to console only - no user-facing feedback in RoomListPage

---

## 5. Designer V2 Issues

### 5.1 Component Size

| Component | Lines | Action |
|-----------|-------|--------|
| `DriftSimulatorTab.tsx` | 754 | Split into `DriftControls`, `DriftResults`, `DriftComparison` |
| `TriggerResponseEditor.tsx` | 404 | Extract `TriggerResponseRow` and `PresetLegend` |
| `BondsTab.tsx` | 362 | Extract inline `BondDetailPanel` to own file |

### 5.2 React Query Key Inconsistency

- BondsTab uses: `['designer-v2', 'bonds', selectedAgent]`
- CalibrationTab uses: `['designer', 'v2', 'bonds', selectedAgentId]`
- **Fix**: Standardize all query keys to `['designer-v2', ...]` prefix.

### 5.3 State Management

`DriftSimulatorTab` has 10+ separate `useState` calls for form fields. Consolidate into a single `useReducer` or form state object.

### 5.4 Missing Constants File

8+ hardcoded magic numbers (confidence threshold `30`, divergence thresholds `0.15`/`0.4`, epsilon `0.001`, default duration `7` days). Extract to `constants/designer.ts`.

---

## 6. Games Module Issues

The games module is the cleanest subsystem (8.5/10). Minor issues:

| Issue | Location | Severity |
|-------|----------|----------|
| Dual registry export support (`default` + `loaderContract`) | `registry.ts` | Low - only `default` used |
| TicTacToe accepts both 0-8 and 1-9 indexing | `TicTacToeModule.ts:92-113` | Low - ambiguous for LLM |
| Chess `normalizeChessMove()` no max-length check | `ChessModule.ts:46-67` | Low |
| `promptInstructions` hardcoded in frontend, not fetched from backend catalog | All game modules | Medium - limits admin customization |
| No TicTacToeModule tests | `frontend/src/games/modules/tic-tac-toe/` | Medium |

---

## 7. Frontend Architecture Issues

### 7.1 AdminPanel.tsx is 1400+ lines
Split into: `UsersTab`, `AgentsTab`, `GamesTab`, `MappingsTab` sub-components.

### 7.2 TTS Dual Source of Truth
`ttsEnabled` lives in both `appStore` (with localStorage) and `currentUser.preferences`. App.tsx syncs them but this creates a split-brain risk. **Pick one**: either appStore reads from preferences on init and writes back, or remove the localStorage copy.

### 7.3 User Logout Logic Split Across 3 Files
`userStore.setUser()` -> `useAppStore.clearSessionId()` + `useChatStore.clearMessages()` + `useRenderStore.setCurrentUser()`. Also in Drawer.tsx and App.tsx. **Fix**: Create `useLogout()` hook that encapsulates the full cleanup.

### 7.4 Missing Test Coverage (Critical Hooks)

| Hook | Lines | Tests |
|------|-------|-------|
| `useChat.ts` | 326 | None |
| `useSession.ts` | 202 | None |
| `useVoiceChat.ts` | 160 | None |
| `useRoomChat.ts` | 147 | None |

These are the most complex hooks and the most critical paths. Prioritize testing `useChat` and `useSession`.

---

## 8. Backend Architecture Issues

### 8.1 Error Handling Inconsistency

- `routers/chat.py:602` raises `HTTPException` directly instead of using `service_unavailable()` factory
- Some routers return plain dicts, others use Pydantic response models
- Guard clause ordering varies (auth-first vs existence-first)

**Fix**: Standardize all routers to use exception factories and Pydantic response models.

### 8.2 Emotion Engine Locking Risk

`routers/chat.py:31-43` creates per-user-agent `asyncio.Lock`. No timeout on acquisition. Rapid user interaction + background tasks could deadlock.

**Fix**: Use `asyncio.wait_for(lock.acquire(), timeout=5.0)`.

### 8.3 Missing Repository Tests

No tests exist for the repository layer (UserRepository, AgentRepository, SessionRepository, RoomRepository, GameRepository). These are critical for data access correctness.

### 8.4 Version String Out of Sync

- `README.md` doesn't specify version
- `backend/main.py` reports `5.5.3`
- `CHANGELOG.md` has entries up to `5.6.3`

**Fix**: Bump `main.py` VERSION to `5.6.3`.

---

## 9. Documentation Inconsistencies

| Issue | Location |
|-------|----------|
| README references `docs/API.md` and `docs/DESIGN.md` which don't exist | `README.md` |
| README mentions ElevenLabs WebSocket API but backend uses REST | `README.md` |
| DOCUMENTATION.md mentions "Clawdbot" service module but it was deleted | `DOCUMENTATION.md` |
| Changelog mentions `emotional_events` V1 and V2 but docs don't explain the distinction | Multiple |

---

## 10. Prioritized Action Plan

### Immediate (delete dead code, fix bugs)
1. Delete `useTTS.ts` hook and its export from `hooks/index.ts`
2. Delete dead config values: `trigger_classifier_enabled`, `trigger_classifier_confidence`, `clawdbot_agents_dir`
3. Delete unused imports in `chat.py` (`File`, `bad_request`)
4. Delete `RoomRepository.add_participant()` dead method
5. Bump `VERSION` in `main.py` to `5.6.3`
6. Fix `SimulationTriggerDetail` type mismatch (backend must return the fields or frontend must remove them)

### Short-term (reduce duplication, improve robustness)
7. Extract mood-weights JSON parsing to repository method
8. Extract profile JSON parsing to repository method
9. Consolidate `getCategoryForTrigger()` to single utility
10. Create `<SelectField>` shared component for designer tabs
11. Fix React Query key inconsistency in CalibrationTab
12. Add abort-on-unmount to RoomChatPage
13. Align `CreateRoomRequest.agent_ids` max with `DEFAULT_ROOM_SETTINGS.max_agents`
14. Add lock timeout to emotion engine locks
15. Use strict literal types for frontend `RoomAgent.role` and `response_mode`

### Medium-term (architecture improvements)
16. Split `DriftSimulatorTab` into 3 sub-components
17. Split `AdminPanel.tsx` into tab sub-components
18. Create `useLogout()` hook to consolidate user-switch cleanup
19. Resolve TTS dual source of truth
20. Decide: finish or remove relationship dimension updates in emotion engine
21. Decide: finish or remove trigger calibration DB persistence
22. Drop `emotional_events` V1 table and dead `emotional_state` columns
23. Move emotion pre/post processing to `services/emotion_pipeline.py`
24. Extract `constants/designer.ts` for magic numbers

### Long-term (test coverage, polish)
25. Add tests for `useChat`, `useSession`, `useVoiceChat`, `useRoomChat` hooks
26. Add repository layer tests
27. Add TicTacToeModule tests
28. Add designer API layer tests (`designerApiV2.ts`)
29. Wire room compaction to router (or remove schema columns)
30. Consider lazy-loading charts in DriftSimulatorTab

---

## 11. LLM Agent Maintainability Notes

To make this codebase easier for LLM coding agents to work with:

1. **Single source of truth per concept**: The TTS dual-store and mood-weights-parsing duplication are the biggest traps. An agent will find one location and miss the other.

2. **Consistent error patterns**: Mixing `HTTPException` with exception factories means an agent copying patterns from one router will write inconsistent code in another.

3. **Dead code creates confusion**: The orphaned `detect_triggers_llm()` and `DIMENSION_UPDATES` look like they're part of the system. An agent asked to "add LLM trigger detection" might try to wire these instead of writing fresh code.

4. **Magic numbers**: The 30+ hardcoded thresholds in the designer components mean every agent interaction requires re-reading the code to understand valid ranges.

5. **Component size**: DriftSimulatorTab at 754 lines and AdminPanel at 1400+ lines exceed what an agent can effectively reason about in a single context window.

6. **Query key inconsistency**: An agent adding a new designer tab will guess the wrong query key prefix 50% of the time.

---

*Generated by deep code review, 2026-02-11.*
