# Code Review Findings — 2026-02-09

> **Context**: Trusted household app on LAN with hosted OpenClaw LLM gateway.
> Security findings rated accordingly (network auth threats downgraded).

## Summary

| Severity | Total | Resolved | Unresolved |
|----------|-------|----------|------------|
| CRITICAL | 5     | 4        | 1          |
| HIGH     | 15    | 10       | 5          |
| MEDIUM   | 25    | 0        | 25         |
| LOW      | 20+   | 0        | 20+        |

---

## CRITICAL

### C1. `or` pattern resets trust/intimacy of 0.0 back to defaults — RESOLVED
**Files**: `chat.py:102-107`, `emotional.py:27-35`, `designer_v2.py:99-108`
Python `or` treats `0.0` as falsy. `state_row['trust'] or 0.5` resets genuine 0.0 to 0.5.
Affected: trust (0→0.5), attachment (0→0.3), intimacy (0→0.2), playfulness_safety (0→0.5), conflict_tolerance (0→0.7).
**Fix**: Use `x if x is not None else default`.

### C2. `this.stateMachine` reference doesn't exist in AnimationController — RESOLVED
**File**: `frontend/src/avatar/AnimationController.ts:353-365`
`executeMicroBehavior` calls `this.stateMachine?.hasAction(...)` but property never declared.
Head_tilt and posture_shift micro-behaviors are completely dead in production.
**Fix**: Use imported `animationStateMachine` singleton.

### C3. Emotional state read-modify-write race condition — UNRESOLVED
**Files**: `chat.py` (`_process_emotion_pre_llm` + `_process_emotion_post_llm`)
Two concurrent chat messages for same user-agent pair clobber each other's state writes.
Exacerbated by connection-per-operation SQLite model.
**Fix**: WAL mode + single connection per request, or advisory locking.

### C4. AudioContext / MediaElementAudioSourceNode lifecycle in LipSyncEngine — RESOLVED
**File**: `frontend/src/avatar/LipSyncEngine.ts:244-272`
`createMediaElementSource()` called on reused audio elements after stop() nulls sourceNode → DOMException.
AudioContext never closed in dispose().
**Fix**: WeakMap tracks sourceNode per-element; added `dispose()` that closes AudioContext.

### C5. Thread-unsafe lazy singletons in emotion_engine.py — RESOLVED
**File**: `backend/services/emotion_engine.py:37-87`
`_LazyList`/`_LazyDict` TOCTOU race in `_ensure()`: concurrent first-access causes duplicate entries.
`__bool__()` not overridden → `if MOODS:` returns False before init.
**Fix**: Replaced with `threading.Lock` double-checked locking in `_get_moods()`. Removed `_LazyList`/`_LazyDict`; all callers use `get_mood_list()`/`get_mood_valence_arousal()`.

---

## HIGH

### H1. SQLite has no WAL mode or busy_timeout — RESOLVED
**File**: `backend/db/connection.py:31-43`
Connection-per-operation with default journal mode → SQLITE_BUSY under concurrent load.
**Fix**: Add `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` in `get_db()`.

### H2. Negative feedback spiral on low-trust teasing — RESOLVED
**File**: `backend/services/emotion_engine.py:1124`
When trust < 0.4, play trigger intensity goes negative, inverting trust delta → unrecoverable spiral.
**Fix**: Clamped low-trust play trigger intensity to 0.0 (suppress entirely) instead of going negative.

### H3. `pop_pending_triggers` is not atomic — RESOLVED
**File**: `backend/db/repositories/emotional_state.py:305-314`
Two DB connections: read then clear. Concurrent requests double-process triggers.
**Fix**: Single `get_db()` connection with SELECT + UPDATE in one transaction.

### H4. Decay formula can overshoot baseline — RESOLVED
**File**: `backend/services/emotion_engine.py:705-707`
Linear decay with `rate * recovery * hours > 1.0` overshoots baseline.
**Fix**: Replaced with exponential decay: `baseline + (current - baseline) * exp(-rate * recovery * hours)`. Also fixed mood decay.

### H5. Rapid `setMood()` permanently disables blinking — RESOLVED
**File**: `frontend/src/avatar/AnimationController.ts:370-384`
Each emotion change disables blink; rapid changes orphan the pauseResolve promise.
**Fix**: BlinkController.setEnabled() now resolves orphaned pauseResolve before creating new one.

### H6. AnimationController.dispose() incomplete cleanup — RESOLVED
**File**: `frontend/src/avatar/AnimationController.ts:532-544`
Missing: idleAnimations, animationPlayer, microBehaviorController, ambientBehavior disposal.
LipSyncEngine gets `.stop()` not `.dispose()`.
**Fix**: Added idleAnimations/animationPlayer/lipSyncEngine disposal + null all refs. Added LipSyncEngine.dispose() method.

### H7. SSE stream buffer lost on connection drop — UNRESOLVED
**File**: `frontend/src/utils/api.ts:259-361`
Partial buffer silently discarded on server disconnect. UI stuck in "thinking" state.
**Fix**: Add timeout, flush partial buffer, or fire onDone with error state.

### H8. `infer_outcome_multisignal` mood sets don't match DB mood IDs — RESOLVED
**File**: `backend/services/emotion_engine.py:474-481`
Hardcoded `{"happy","playful",...}` vs actual DB IDs `{"supportive","euphoric",...}`. Agent tag signal never fires.
**Fix**: Derived positive/negative mood sets from MOOD_GROUPS (warm/playful → positive, sharp/dark → negative).

### H9. No V2 test coverage — UNRESOLVED
**File**: `backend/tests/test_emotion_engine.py`
Zero tests for: TriggerCalibration, compute_effective_delta, learn_from_outcome,
update_relationship_dimensions, infer_outcome_multisignal, normalize_trigger, ContextBucket.

### H10. `asyncio.create_task` not GC-protected — RESOLVED
**File**: `backend/routers/chat.py:146`
Uses raw `create_task()` instead of `_spawn_background()` → task can be GC'd mid-execution.
**Fix**: Replace with `_spawn_background()`.

### H11. AnimationGraph setTimeout callbacks fire after dispose() — RESOLVED
**File**: `frontend/src/avatar/AnimationGraph.ts:40-45, 125-131`
Captured `this.mixer` via closure, no timeout cancellation or event listener removal on dispose.
**Fix**: `safeTimeout()` helper tracks all handles; `dispose()` clears them + removes 'finished' event listener + sets `disposed` flag.

### H12. ESLint config only covers JS/JSX, not TypeScript — RESOLVED
**File**: `frontend/eslint.config.js:11`
`files: ['**/*.{js,jsx}']` — entire TS/TSX codebase is unlinted.
**Fix**: Change to `['**/*.{ts,tsx,js,jsx}']` and add typescript-eslint.

### H13. User message stored before LLM call can orphan — UNRESOLVED
**File**: `backend/routers/chat.py:519, 613`
LLM failure leaves user message in DB with no assistant response.

### H14. `normalize_trigger` passes unrecognized triggers through — RESOLVED
**File**: `backend/services/emotion_engine.py:278`
Arbitrary strings pass normalization → pollute calibration data.
**Fix**: `TRIGGER_ALIASES.get(trigger)` now returns `None` for unrecognized triggers (removed fallback to original string).

### H15. API.md missing 20 endpoints; AGENTS.md lists deleted files — UNRESOLVED
**Files**: `docs/API.md`, `AGENTS.md`
Emotional (6) + designer_v2 (14) endpoints undocumented. AGENTS.md still has clawdbot.py, stt.py.

---

## MEDIUM

| # | Area | Finding | Status |
|---|------|---------|--------|
| M1 | Backend | `_process_emotion_post_llm` sync I/O blocks event loop | UNRESOLVED |
| M2 | Backend | `config_loader` lru_cache never invalidated on DB changes | UNRESOLVED |
| M3 | Backend | Simulate endpoint intensity formula differs from actual engine | UNRESOLVED |
| M4 | Backend | `update()` always increments interaction_count (even resets) | UNRESOLVED |
| M5 | Backend | TTS cache base64 blobs unbounded in SQLite | UNRESOLVED |
| M6 | Backend | SSE response accumulation has no size limit | UNRESOLVED |
| M7 | Backend | Session history returns [] instead of 403 for unauthorized | UNRESOLVED |
| M8 | Backend | CORS allows all methods/headers | UNRESOLVED |
| M9 | Backend | Mood cache never invalidated at runtime | UNRESOLVED |
| M10 | Frontend | Audio base64 in Zustand messages → unbounded memory | UNRESOLVED |
| M11 | Frontend | `sendMessage` stale closure for isLoading | UNRESOLVED |
| M12 | Frontend | No React Error Boundary → white screen on crash | UNRESOLVED |
| M13 | Frontend | DebugPanel/AvatarDebugPanel monolithic (700-800 lines each) | UNRESOLVED |
| M14 | Frontend | `preloadVRM` divides by progress.total (can be 0) | UNRESOLVED |
| M15 | Frontend | BlinkController speed is frame-rate dependent | UNRESOLVED |
| M16 | Frontend | `renderStore.setSettings` bypasses per-user persistence | UNRESOLVED |
| M17 | Frontend | Duplicate constants in TriggerResponseEditor/TriggerSensitivityEditor | UNRESOLVED |
| M18 | Docs | CHANGELOG missing 5 recent commits | UNRESOLVED |
| M19 | Docs | VERSION is 5.5.3/5.5.4/5.6.1 in 3 different places | UNRESOLVED |
| M20 | Docs | clawdbot vs openclaw naming inconsistency | UNRESOLVED |
| M21 | Docs | BACKEND-RUN.md references missing frontend nginx service | UNRESOLVED |
| M22 | Docs | scripts/README.md references non-existent dev-designer.sh | UNRESOLVED |
| M23 | Backend | No Pydantic models for emotional/designer endpoints | UNRESOLVED |
| M24 | Backend | `compare_bonds` creates rows via get_or_create (read side-effect) | UNRESOLVED |
| M25 | Frontend | LookAtSystem.setCamera doesn't remove target from old camera | UNRESOLVED |

---

## LOW (Selected)

| # | Area | Finding | Status |
|---|------|---------|--------|
| L1 | Backend | `_lever_description` is dead code (never called) | UNRESOLVED |
| L2 | Backend | `calculate_mood_deltas` deprecated but no warning | UNRESOLVED |
| L3 | Backend | datetime.now() uses local timezone instead of UTC | UNRESOLVED |
| L4 | Backend | Inconsistent error handling patterns across routers | UNRESOLVED |
| L5 | Backend | GROUP_CONCAT returns string not list in admin sessions | UNRESOLVED |
| L6 | Frontend | Duplicate StreamResponse interface in api.ts | UNRESOLVED |
| L7 | Frontend | VoiceService/VoiceActivityDetector singletons never used | UNRESOLVED |
| L8 | Frontend | chatStore uses Date.now()+Math.random() for IDs | UNRESOLVED |
| L9 | Frontend | FBX cache in AnimationLibrary grows monotonically | UNRESOLVED |
| L10 | Frontend | AnimationPlayer recreates static boneMap on every call | UNRESOLVED |
| L11 | Frontend | Accessibility: tabs lack ARIA roles, BondCard div clickable | UNRESOLVED |
| L12 | Docs | frontend/README.md is default Vite template | UNRESOLVED |
| L13 | Docs | Test counts stale across multiple docs | UNRESOLVED |
| L14 | Docs | CHANGELOG repo path stale | UNRESOLVED |
