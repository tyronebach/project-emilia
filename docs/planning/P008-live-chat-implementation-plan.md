# P008 Live Chat Sarcasm Mitigation - Implementation Plan (Phase 1 + Phase 2)

**Date:** 2026-02-12  
**Status:** Proposed (repo-validated)  
**Source:** `docs/planning/P008-sarcasm-detection-mitigation.md`

---

## 1. Feasibility Verdict

**Yes - achievable with low-to-medium complexity and clear product benefit.**

Why:
1. Live chat and room chat both pass through `backend/routers/chat.py::_process_emotion_pre_llm`.
2. Trigger detection is centralized in `EmotionEngine.detect_triggers()`.
3. Trigger classification is centralized in `TriggerClassifier.classify()`.
4. Designer `/simulate` already uses `EmotionEngine.detect_triggers()`, so improvements there propagate automatically.
5. Archetype generation uses `TriggerClassifier.classify()`, so future drift datasets improve too.

---

## 2. Repo Reality Check (What Must Change vs Current P008)

Current P008 has two mismatches with the codebase:
1. `backend/services/emotion_classifier.py` does not exist. Existing classifier is `backend/services/trigger_classifier.py`.
2. Archetype-level toggles (`outcome_weights` / per-archetype flags) do **not** affect live chat; archetypes are drift-simulator-only.

Implication:
- Keep existing Phase 1 workaround (`outcome_weights`) for simulator.
- Implement sarcasm mitigation in shared trigger-classification/detection path for live runtime.

---

## 3. Locked Design Decisions

1. **No new model in Phase 1/2** (no irony transformer, no extra inference latency).
2. **No per-archetype runtime logic** for live chat in this phase.
3. **Single-path integration**: implement in classifier + emotion engine so chat, rooms, and designer simulate all benefit.
4. **Deterministic, reversible rollout** with env flags and conservative defaults.
5. **No schema migration required** for Phase 1/2.

---

## 4. Scope

### In scope
1. Phrase-level sarcasm overrides.
2. Co-occurrence dampening for positive triggers under sarcastic/negative context.
3. Recent-context signal (lightweight) for dampening.
4. Tests for sarcasm positives and non-sarcastic false-positive protection.

### Out of scope
1. Dedicated sarcasm model.
2. Retraining/fine-tuning GoEmotions model.
3. UI/editor for sarcasm phrase dictionary.

---

## 5. Phase 1 - Runtime Plumbing + Guardrails

**Goal:** Add safe hooks so Phase 2 behavior can run in live chat with minimal churn.

### 5.1 Code Tasks

- [ ] Add a small sarcasm config block (env-driven) in `backend/services/trigger_classifier.py`.
- [ ] Add reusable trigger post-processing helper in `backend/services/trigger_classifier.py` (no behavior change yet when disabled).
- [ ] Extend `EmotionEngine.detect_triggers()` signature to accept optional recent-context signal (default keeps backward compatibility).
- [ ] Add repository helper for recent negative trigger presence (e.g., last 5 events) in `backend/db/repositories/emotional_state.py`.
- [ ] Pass recent-context signal from `_process_emotion_pre_llm()` in `backend/routers/chat.py` into `engine.detect_triggers(...)`.

### 5.2 Guardrails

- [ ] Keep default OFF switch: `SARCASM_MITIGATION_ENABLED`.
- [ ] Ensure fallback behavior is exactly current logic when disabled.
- [ ] Add debug logging only when mitigation actually modifies scores.

### 5.3 Phase 1 Exit Criteria

- [ ] All existing emotion/chat tests pass unchanged when mitigation is disabled.
- [ ] No API contract changes.
- [ ] No measurable added latency beyond trivial post-processing.

---

## 6. Phase 2 - Sarcasm Phrase Lookup + Co-occurrence Dampening

**Goal:** Improve trigger quality in live runtime with deterministic rules.

### 6.1 Phrase Lookup Rules (Quick Win)

Implement in `backend/services/trigger_classifier.py`:
- [ ] Add curated phrase map for strong sarcasm indicators.
- [ ] Support exact-match and bounded contains-match modes.
- [ ] On match: inject/boost negative trigger (`annoyance|disapproval|disappointment`) and optionally cap conflicting positive trigger confidence.

Recommended initial phrase set:
1. `thanks a lot`
2. `thanks for nothing`
3. `great job genius`
4. `real helpful`
5. `oh perfect`
6. `just great`

### 6.2 Co-occurrence Dampening

Implement in `backend/services/emotion_engine.py` within `detect_triggers()` post-classification:
- [ ] Define positive class: `{admiration, approval, gratitude, joy, love, optimism}`.
- [ ] Define negative class: `{anger, annoyance, disapproval, disgust, disappointment}`.
- [ ] If message has negative + positive together, dampen positive intensity by factor (ex: `0.3`).
- [ ] If recent context indicates sustained negativity, dampen positive-only spikes (conservative threshold).

### 6.3 Live Runtime Coverage

This reaches all required paths automatically:
1. 1:1 chat: `backend/routers/chat.py`.
2. Rooms/multi-agent: `backend/routers/rooms.py` (reuses `_process_emotion_pre_llm`).
3. Designer simulate: `backend/routers/designer_v2.py` via `engine.detect_triggers()`.
4. Future archetype generation: `backend/db/repositories/archetype_repository.py` via `classifier.classify()`.

### 6.4 Phase 2 Exit Criteria

- [ ] Sarcastic test phrases produce negative-leaning triggers.
- [ ] Genuine positive controls remain positive.
- [ ] No regression in existing trigger normalization or calibration flow.

---

## 7. File-Level Change Plan

### Backend runtime
1. `backend/services/trigger_classifier.py`
2. `backend/services/emotion_engine.py`
3. `backend/routers/chat.py`
4. `backend/db/repositories/emotional_state.py`

### Backend tests
1. `backend/tests/test_trigger_classifier.py`
2. `backend/tests/test_emotion_engine.py`
3. `backend/tests/test_api.py` (live chat integration path)
4. `backend/tests/test_rooms.py` (room path smoke coverage)
5. `backend/tests/test_archetypes.py` (generation path uses same classifier)

---

## 8. Test Matrix (Minimum)

### Sarcasm detection
- [ ] `"thanks a lot"` -> includes `annoyance|disapproval`.
- [ ] `"great job genius"` -> negative-leaning trigger tops.
- [ ] `"oh perfect, just perfect"` -> negative-leaning trigger present.

### Genuine positives (anti-regression)
- [ ] `"thank you so much!"` -> `gratitude` remains.
- [ ] `"great job, proud of you"` -> `admiration|approval` remains.

### Co-occurrence
- [ ] Mixed phrase with explicit negative + positive labels dampens positive scores.
- [ ] Positive-only message is unchanged when no sarcasm signal.

### Integration
- [ ] `/api/chat` returns emotion debug triggers consistent with mitigation.
- [ ] `/api/rooms/{room_id}/chat` path executes without behavior regression.

---

## 9. Coding-Agent Execution Plan (Small PRs)

### PR 1 - Phase 1 plumbing
1. Add config + no-op post-processing hooks.
2. Wire optional recent-context signal into `detect_triggers()`.
3. Add/adjust baseline tests (no behavior change when disabled).

### PR 2 - Phrase override behavior
1. Add phrase dictionary and override logic.
2. Add focused classifier unit tests.

### PR 3 - Co-occurrence dampening
1. Add dampening logic in `EmotionEngine.detect_triggers()`.
2. Add engine-level and chat integration tests.

### PR 4 - Hardening + docs
1. Tune phrase list and thresholds from test observations.
2. Update `CHANGELOG.md` and `DOCUMENTATION.md`.

---

## 10. Risks and Mitigations

1. **Risk:** Over-dampening genuine positive mixed messages.  
   **Mitigation:** Require explicit sarcasm/negative signals before strong dampening.

2. **Risk:** Phrase list overfits narrow examples.  
   **Mitigation:** Keep list short/high-confidence; rely on co-occurrence for generalization.

3. **Risk:** Hidden regressions in live chat emotional drift.  
   **Mitigation:** Keep feature flag + integration tests on chat/rooms.

---

## 11. Success Metrics

1. Reduced false-positive positive triggers for known sarcastic phrases.
2. Stable trigger quality on non-sarcastic positives.
3. No significant chat latency increase.
4. Fewer "unexpected admiration/gratitude" spikes in aggressive interactions.

---

## 12. Recommendation

Proceed with this Phase 1 + Phase 2 plan.

Rationale:
1. It directly addresses live chat (not only simulator).
2. It reuses existing central hooks, minimizing complexity.
3. It provides measurable quality gains with rollback safety.
