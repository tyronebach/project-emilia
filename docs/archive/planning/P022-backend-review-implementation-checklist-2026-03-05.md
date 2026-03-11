# P022 — Backend Review Implementation Checklist (Safe PR Sequence)

**Date**: 2026-03-05  
**Scope**: Backend only (no frontend refactor)  
**Goal Alignment**: Improve realism reliability by removing drift/duplication/fake fallbacks without changing core companion behavior.

---

## Ground Rules

- Keep changes incremental and reversible.
- One PR = one concern (or one tightly related cluster).
- No behavior rewrites unless explicitly called out.
- Add/adjust tests with every behavior-affecting PR.
- Prioritize “reduce hidden failure modes” over “clean architecture aesthetics.”

---

## PR-1 — Remove dead OpenClaw fallback in room non-stream path

**Why first**: Lowest-risk correctness fix; removes confusing double-failure path.

### Files
- `backend/routers/rooms.py`

### Edits
1. Remove `_call_legacy_openclaw_non_stream()` (if no remaining callsites).
2. Remove `try/except ValueError` wrapper around `call_llm_non_stream()` that string-matches `"OPENAI_API_KEY is required"`.
3. Let `call_llm_non_stream()` failures propagate to existing HTTP error handling directly.
4. Ensure returned error to client remains clear (`503` with actionable detail).

### Tests
- Add/extend room chat error-path test to assert no legacy fallback attempt occurs.
- Assert missing API key yields single clear failure, not chained fallback noise.

### Acceptance
- No references to `_call_legacy_openclaw_non_stream` remain.
- Missing key failure path is deterministic and clean.

---

## PR-2 — Add observability for persona compaction fallback (keep fallback)

**Why second**: Preserve resilience but stop silent realism degradation.

### Files
- `backend/services/compaction.py`
- `backend/tests/test_compaction_v2.py`

### Edits
1. In persona mode, when `_is_structured_summary_valid(summary)` fails:
   - log warning with room type + mode + summary length (+ safe excerpt if needed).
   - increment metric/counter (e.g. `compaction_persona_fallback=1`).
2. Keep neutral fallback behavior unchanged.
3. Optionally add a metric for validation-pass rate.

### Tests
- Force invalid persona output and verify:
  - fallback executes,
  - warning emitted (caplog),
  - metric call includes fallback marker.

### Acceptance
- Persona fallback is visible in logs/metrics.
- No change to successful persona compaction path.

---

## PR-3 — Consolidate `_extract_content()` into one helper

**Why third**: Pure dedupe, low blast radius, removes subtle inconsistency.

### Files
- New: `backend/services/llm_response.py`
- Update callsites:
  - `backend/services/compaction.py`
  - `backend/services/llm_client.py`
  - `backend/services/soul_simulator.py`
  - `backend/services/dreams/runtime.py`

### Edits
1. Create `extract_content(payload: dict[str, Any]) -> str` with strict validation and clear `ValueError` messages.
2. Replace local duplicated implementations.
3. Keep external behavior equivalent where possible.

### Tests
- Add helper unit tests for malformed payload variants (missing choices/message/content, empty string).
- Update existing tests if exact error text changed.

### Acceptance
- Single source of truth for content extraction.
- No duplicated `_extract_content` functions remain.

---

## PR-4 — Remove micro-duplications (`_message_behavior`, workspace guard)

**Why fourth**: Fast cleanup; reduces incidental drift.

### Files
- `backend/routers/rooms.py`
- `backend/services/room_chat_stream.py`
- `backend/services/room_chat.py`
- (optional new helper) `backend/services/context_utils.py`

### Edits
1. Delete duplicate `_message_behavior()` functions; use `extract_behavior_dict` from `room_chat.py`.
2. Introduce one helper for workspace validity, e.g. `has_workspace(value: object) -> bool`.
3. Replace repeated `isinstance(agent_workspace, str) and agent_workspace.strip()` checks with helper.

### Tests
- Ensure response behavior payload shape remains unchanged.
- Add small unit test for `has_workspace` helper.

### Acceptance
- Duplicate helpers removed.
- No behavior change in serialized room message payload.

---

## PR-5 — Exception policy hardening in emotion runtime (with test-first guardrails)

**Why fifth**: High impact but potentially behavior-affecting; do carefully.

### Files
- `backend/services/emotion_runtime.py`
- `backend/tests/test_emotion_engine.py` (or add dedicated runtime tests)

### Edits
1. Replace blanket `except Exception` in `process_emotion_pre_llm` with narrow catches for data-level issues (`json decode`, type/shape errors).
2. For structural failures (DB operational/schema errors), log and propagate.
3. Apply same policy review to `process_emotion_post_llm` (narrow where safe).
4. Add structured error logs including exception type and context (`agent_id`, `user_id`, source).

### Tests
- Simulate data corruption path -> graceful degradation.
- Simulate structural DB failure -> error propagates (or explicit typed handling if desired).
- Verify logs emitted for degraded mode.

### Acceptance
- Emotional continuity failures are no longer silent.
- Normal chat still works under benign partial data issues.

---

## PR-6 — Time-bucket and canon/lived-experience consolidation

**Why sixth**: Moderate refactor; improves consistency across prompt and dream paths.

### Files
- `backend/services/chat_context_runtime.py`
- `backend/services/direct_llm.py`
- `backend/services/dreams/runtime.py`
- repo layer (new/extended repository for lived experience)

### Edits
1. Use one time-of-day bucket function (import instead of duplicate logic).
2. Consolidate canon loading to one helper used by direct + dreams.
3. Move lived-experience get/get-or-create behind repository methods with clear contracts.

### Tests
- Add tests for shared helper behavior.
- Ensure direct prompt + dreams runtime still receive equivalent canon/lived text.

### Acceptance
- No duplicate canon/time/lived-experience helper implementations.
- Consistent semantics across direct and dreams.

---

## PR-7 — Shared orchestration extraction (largest refactor)

**Why last**: Biggest blast radius; safest after smaller cleanups stabilize.

### Files
- `backend/services/room_chat.py` (new orchestration functions)
- `backend/routers/chat.py`
- `backend/routers/rooms.py`
- `backend/services/room_chat_stream.py`
- New tests: `backend/tests/test_orchestration.py`, `backend/tests/test_room_chat_stream.py`

### Edits
1. Extract shared pre-LLM assembly and post-LLM hook execution into reusable orchestration functions.
2. Non-stream DM/group routes call shared orchestration.
3. Stream path uses shared pre/post while keeping streaming loop-specific transport/events.
4. Keep SSE event schema stable.

### Tests
- Golden-path tests for DM non-stream, room non-stream, room SSE.
- Error-path tests for per-agent failure isolation.
- Assert memory/top-of-mind/emotion hooks are invoked consistently in all paths.

### Acceptance
- Single canonical orchestration path.
- Parity between stream and non-stream context/hook behavior.

---

## Deferred / Optional Cleanup (after P022 sequence)

1. Config cleanup:
   - remove dead aliases (`llm_trigger_detection`, `trigger_classifier_llm_fallback`) if truly unused.
   - promote EmotionEngine direct env reads into `config.py`.
2. Remove `OPENCLAW_MEMORY_DIR` if truly unused across runtime and docs.
3. Add `PROMPT_ASSEMBLY.md` documenting exact prompt block order and ownership.

---

## Rollout Safety Checklist (apply per PR)

- [ ] Run backend tests (`pytest`) locally/CI.
- [ ] Verify one DM chat turn manually.
- [ ] Verify one room multi-agent turn manually.
- [ ] If touching stream path: verify SSE events in dev UI/log capture.
- [ ] Check logs for new warnings/errors introduced by change.
- [ ] Confirm no schema migration side effects.

---

## Suggested Branch / Commit Strategy

- Branch base: `master`
- PR branches:
  - `refactor/p022-remove-dead-openclaw-fallback`
  - `feat/p022-compaction-fallback-observability`
  - `refactor/p022-unify-llm-extract-content`
  - `refactor/p022-dedupe-micro-helpers`
  - `fix/p022-emotion-exception-policy`
  - `refactor/p022-shared-canon-time-lived-context`
  - `refactor/p022-orchestration-unification`

Commit style examples:
- `fix(rooms): remove dead legacy openclaw fallback path`
- `feat(compaction): log and metric persona fallback activation`
- `refactor(llm): centralize response content extraction helper`

---

## Definition of Done (P022)

- No dead legacy fallback paths in room non-stream flow.
- No silent persona-compaction degradation without signal.
- No duplicate `_extract_content` and `_message_behavior` helpers.
- Emotion runtime no longer swallows structural failures silently.
- Shared chat orchestration path established across DM/group/stream where feasible.
- Tests cover streaming + compaction fallback + key orchestration parity.
