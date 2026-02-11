# P007: Drift Simulator Accuracy - V2 Global Archetypes

**Date:** 2026-02-11  
**Status:** Revised (Decision-Locked)  
**Scope:** Align drift simulator behavior with live chat trigger/mood flow using global, editable v2 archetypes in Designer V2.

---

## 1. Locked Decisions

These decisions are final for this plan revision:

1. **No v1 compatibility requirement**. We are replacing legacy archetype behavior, not preserving it.
2. **No user-scoped archetypes**. Archetypes are global assets.
3. **No calibration/bond coupling in simulator**. We do not run user-specific calibration logic or bond-context scaling.
4. **Keep current Designer V2 router style** (`dict[str, Any]` payloads in `designer_v2.py`) for consistency.
5. **Do not add a new top-level Designer tab**. Archetype management lives inside the existing Drift tab.
6. **Keep complexity low**. Use synchronous generation with strict input limits (no new async job system).

---

## 2. Problem Statement

Current drift simulation diverges from live pre-LLM trigger flow:

| Aspect | Live Chat Pre-LLM | Current Drift Simulator |
|---|---|---|
| Triggers per message | Multiple | Single sampled trigger |
| Intensity source | Classifier confidence | Random `uniform(0.3, 1.0)` |
| Mood projection | One projection after total V/A accumulation | Projection per trigger |
| Archetype source | Real messages -> classifier | Hand-authored weight maps |

Result: simulator outputs are less representative for persona tuning.

---

## 3. Goals

1. Drift simulator applies **multiple triggers per message**.
2. Trigger intensity comes from **classifier confidence** captured in archetype data.
3. Simulator uses **v2 replay archetypes only** (global, editable).
4. Users can **upload `.txt` files** to generate archetypes in Designer.
5. Drift simulation behavior matches live structure for:
   - multi-trigger loop
   - V/A accumulation
   - single mood projection per message
6. Existing drift endpoints remain stable from frontend perspective.

---

## 4. Non-Goals

1. No user-personalized calibration in drift simulation.
2. No bond-state replay from specific real users.
3. No background queue/worker architecture for file generation in this phase.
4. No new Designer top-level tab.

---

## 5. Target Simulation Behavior

### 5.1 Parity Definition (Structural)

For each simulated message:

1. Get trigger set from archetype replay data (`[(trigger, intensity), ...]`).
2. For each trigger: apply `engine.apply_trigger(...)`.
3. Accumulate total `valence` and `arousal` deltas across all triggers.
4. Run `calculate_mood_deltas_from_va(total_va_delta)` once.
5. Apply mood deltas once.
6. Apply outcome effect (`positive/neutral/negative`) as today.

### 5.2 Explicit Exclusion

Do **not** call `apply_trigger_calibrated` in drift simulator for this plan, because this plan excludes user-specific calibration and bond-context scaling.

---

## 6. Data Model

### 6.1 New Table: `drift_archetypes`

```sql
CREATE TABLE IF NOT EXISTS drift_archetypes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    message_triggers TEXT NOT NULL,      -- JSON: [[ ["trigger", 0.82], ... ], ...]
    outcome_weights TEXT DEFAULT '{}',   -- JSON: {"positive":0.3,"neutral":0.4,"negative":0.3}
    sample_count INTEGER DEFAULT 0,
    source_filename TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_drift_archetypes_updated_at ON drift_archetypes(updated_at DESC);
```

### 6.2 Notes

1. No `version` field needed (this is v2-only).
2. No `is_system` or `created_by` (global model).
3. All archetypes are editable/deletable.

### 6.3 Bootstrap Strategy

1. On first migration, seed global archetypes (`aggressive`, `supportive`, `playful`, `flirty`, `neutral`, `random`, `rough_day_then_recover`, `lonely_then_playful`, `moody_week`) as replay datasets.
2. After seed is in DB, drift runtime reads from DB only (no in-memory archetype source of truth).

---

## 7. Backend API (Designer V2)

All endpoints remain under `/api/designer/v2` in `backend/routers/designer_v2.py`, with existing auth dependency.

### 7.1 Endpoints

1. `GET /archetypes`
   - Returns list metadata: `id`, `name`, `description`, `sample_count`, `updated_at`.
2. `GET /archetypes/{id}`
   - Returns full archetype: includes `message_triggers`, `outcome_weights`.
3. `POST /archetypes`
   - Create manual archetype.
4. `POST /archetypes/generate` (`multipart/form-data`)
   - Input: `file`, `id`, `name`, `description`, optional `outcome_weights` JSON.
   - Process lines through classifier, store replay data.
5. `PUT /archetypes/{id}`
   - Update `name`, `description`, `outcome_weights`, optional full `message_triggers` replacement.
6. `DELETE /archetypes/{id}`
   - Hard delete (global archetypes are editable and deletable).

### 7.2 Validation

1. `id` slug validation (`[a-z0-9-_]`, length cap).
2. `outcome_weights` must be non-negative and normalized (or normalized server-side).
3. `message_triggers` entries must use canonical triggers and confidence range `[0.0, 1.0]`.

### 7.3 Repository

**File:** `backend/db/repositories/archetype_repository.py`

Methods:

1. `list_all()`
2. `get(archetype_id)`
3. `create(payload)`
4. `update(archetype_id, payload)`
5. `delete(archetype_id)`
6. `generate_from_messages(...)`

---

## 8. Drift Simulator Refactor

### 8.1 Source of Truth

1. Remove runtime dependency on `ARCHETYPES` as authoritative drift data.
2. Load archetype definition from repository at simulation execution time.
3. Update route-level validation to use repository existence checks (not in-memory map checks).

### 8.2 Config Update

Add replay mode to config and request parsing:

```python
replay_mode: Literal["sequential", "random"] = "sequential"
```

### 8.3 Message Loop Update

1. Replace single trigger sampling with trigger-set replay.
2. Use per-message V/A accumulation then single mood projection.
3. Keep existing outcome sampling and decay behavior.

### 8.4 Timeline Contract

To avoid frontend breakage while supporting multi-trigger visibility:

1. Keep existing fields: `trigger`, `intensity`.
2. Add new field: `triggers: list[dict[str, float | str]]`.
3. Populate legacy fields from first trigger when available; empty defaults otherwise.

---

## 9. Frontend Integration (Drift Tab Only)

### 9.1 No New Top-Level Tab

Keep `DesignerTabsV2` unchanged. Add archetype management UI inside `DriftSimulatorTab`.

### 9.2 Drift Tab Additions

1. "Manage Archetypes" button opens modal/drawer.
2. CRUD list in modal.
3. Upload flow (`.txt`) -> generate endpoint.
4. Replay mode selector (`sequential` / `random`) in simulation controls.
5. Refresh archetype query after create/update/delete.

### 9.3 Types/API Client

1. Extend `Archetype` type with metadata fields.
2. Add `ArchetypeDetail` type.
3. Add generate/update/delete/detail API helpers in `designerApiV2.ts`.
4. Extend `DriftSimulationConfig` with `replay_mode`.

---

## 10. Complexity Guardrails

For `POST /archetypes/generate`:

1. Max file size: **2 MB**.
2. Max non-empty lines: **2000**.
3. Max line length: **300 chars** (truncate or reject; choose one and document it).
4. Ignore blank lines.
5. Normalize trigger labels via existing canonical mapping.
6. Keep synchronous request model; return clear 4xx errors for limits.

---

## 11. Testing Plan

### 11.1 Backend

1. `test_archetypes_crud_global`
2. `test_archetype_generate_from_file_success`
3. `test_archetype_generate_limits_enforced`
4. `test_drift_multi_trigger_replay_sequential`
5. `test_drift_multi_trigger_replay_random`
6. `test_drift_va_accumulation_single_mood_projection`
7. `test_drift_routes_validate_against_db_archetypes`

### 11.2 Frontend

1. Drift tab archetype management modal render + CRUD actions.
2. Upload flow happy path + validation error handling.
3. Replay mode selector sends `replay_mode` in request.

### 11.3 Test Cleanup

Replace legacy phase/`ARCHETYPES`-coupled tests with DB-backed archetype tests.

---

## 12. File Change Summary

### New

1. `backend/db/repositories/archetype_repository.py`
2. `backend/tests/test_archetypes.py`
3. `backend/tests/test_drift_simulator_v2.py`

### Modified

1. `backend/db/connection.py` (table + seed)
2. `backend/db/repositories/__init__.py`
3. `backend/routers/designer_v2.py` (CRUD + generate + DB-backed validation)
4. `backend/services/drift_simulator.py` (replay model)
5. `frontend/src/components/designer/DriftSimulatorTab.tsx`
6. `frontend/src/utils/designerApiV2.ts`
7. `frontend/src/types/designer.ts`
8. `DOCUMENTATION.md` (fix drift API doc path and v2 archetype notes)

---

## 13. Definition of Done

1. Drift simulator runs from DB-backed v2 global archetypes only.
2. Multi-trigger replay and V/A accumulation behavior implemented.
3. Archetypes are fully manageable (create/generate/update/delete) from Drift tab UX.
4. Replay mode (`sequential`/`random`) works end-to-end.
5. Drift routes validate archetype IDs against DB, not in-memory constants.
6. Input guardrails prevent expensive uploads without adding job-system complexity.
7. Backend + frontend tests added/updated and passing.
