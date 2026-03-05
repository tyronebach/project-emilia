# P021 — Implementation Ticket List (Backend Realism)

Date: 2026-03-04
Parent spec: `docs/planning/P021-backend-realism-implementation-spec-2026-03-04.md`

---

## Usage Notes

- Ticket IDs are ordered for implementation sequence.
- Estimates are rough engineering effort (ideal dev-days).
- All tickets are backend-only and should preserve existing defaults unless explicitly stated.

---

## Epic A — Foundations, Flags, and Observability

### P021-A01 — Add realism feature flags to config
**Estimate:** 0.5d
**Depends on:** none

**Scope**
- Add all new env flags from P021 spec to `backend/config.py` with safe defaults.
- Keep legacy behavior when flags are unset.

**Files**
- `backend/config.py`
- `docker-compose.yml` (optional default docs comments only)

**Acceptance Criteria**
- App boots with no new env vars set.
- New settings are accessible via `settings.<name>`.
- Unit test validates defaults and parsing.

---

### P021-A02 — Add realism metrics/log schema
**Estimate:** 1d
**Depends on:** P021-A01

**Scope**
- Add structured logging helpers for metrics described in P021 section 8.
- Ensure logs include `agent_id`, `user_id`, `room_id` where applicable.

**Files**
- `backend/services/room_chat_stream.py`
- `backend/services/dreams/runtime.py`
- `backend/services/compaction.py`
- optional: `backend/services/observability.py` (new)

**Acceptance Criteria**
- Metrics log lines emitted for compaction, autorecall, and dreams.
- No PII-rich raw content logged (length/metadata only).

---

### P021-A03 — Build longitudinal eval fixture harness scaffold
**Estimate:** 1d
**Depends on:** P021-A02

**Scope**
- Add deterministic fixture format for multi-week transcript replay.
- Add baseline scoring hooks (continuity/factual drift placeholders).

**Files**
- `backend/tests/fixtures/realism/` (new)
- `backend/tests/test_realism_harness.py` (new)

**Acceptance Criteria**
- Harness runs in CI and outputs stable baseline JSON report.

---

## Epic B — Top-of-Mind Memory Recall

### P021-B01 — Implement TopOfMindRecallService
**Estimate:** 1.5d
**Depends on:** P021-A01

**Scope**
- New service that wraps memory search + gating logic:
  - threshold filter
  - max items
  - max chars
  - diversity by path/chunk
- Return compact prompt block or `None`.

**Files**
- `backend/services/memory/top_of_mind.py` (new)
- `backend/services/memory/search.py` (minor helper export if needed)

**Acceptance Criteria**
- Given mocked results, service injects only qualifying hits.
- Output char budget never exceeds config.

---

### P021-B02 — Wire autorecall into room chat pipeline
**Estimate:** 1d
**Depends on:** P021-B01

**Scope**
- Inject top-of-mind system block in non-runtime-trigger chat path before model call.
- Apply in both streaming and non-streaming paths.

**Files**
- `backend/routers/chat.py`
- `backend/services/room_chat_stream.py`
- `backend/services/room_chat.py` (if message builder update needed)

**Acceptance Criteria**
- Autorecall disabled => no prompt change.
- Autorecall enabled + high score => one injected system block.
- Runtime triggers obey `MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED`.

---

### P021-B03 — Add tests for autorecall gating
**Estimate:** 1d
**Depends on:** P021-B02

**Scope**
- Unit tests for threshold/diversity/budget.
- Integration test confirms injection location and no duplicate block.

**Files**
- `backend/tests/test_top_of_mind.py` (new)
- `backend/tests/test_chat_autorecall_integration.py` (new)

**Acceptance Criteria**
- Tests pass with deterministic fixtures.
- Negative case coverage (no hits, low score, over-budget).

---

## Epic C — Persona-Driven Compaction

### P021-C01 — Compaction prompt v2 builder
**Estimate:** 1.5d
**Depends on:** P021-A01

**Scope**
- Implement mode-gated compaction prompt builder:
  - `off` => legacy neutral
  - `dm_only` => persona style for DM rooms only
  - `all` => persona style for all rooms
- Include factual + texture + open threads + preferences sections.

**Files**
- `backend/services/compaction.py`
- optional: `backend/services/compaction_prompt.py` (new)

**Acceptance Criteria**
- Prompt mode selected correctly by room type and flag.
- Legacy behavior unchanged when mode is `off`.

---

### P021-C02 — Structured compaction output validator
**Estimate:** 1d
**Depends on:** P021-C01

**Scope**
- Parse compaction output into required sections.
- Validate required Facts section is non-empty; fallback to legacy summary if invalid.

**Files**
- `backend/services/compaction.py`

**Acceptance Criteria**
- Invalid LLM output does not break compaction flow.
- Room summary always persists in usable format.

---

### P021-C03 — DM-safe persona compaction wiring in room compactor
**Estimate:** 1d
**Depends on:** P021-C01, P021-C02

**Scope**
- Extend compaction call site with room metadata (type, agent identity context).
- Keep group-room neutral fallback by default.

**Files**
- `backend/services/room_chat_stream.py`
- `backend/db/repositories/room_repository.py` (if helper needed)

**Acceptance Criteria**
- DM rooms use persona mode when enabled.
- Group rooms remain neutral unless mode `all`.

---

### P021-C04 — Compaction regression tests
**Estimate:** 1d
**Depends on:** P021-C03

**Scope**
- Add tests for mode behavior and parser fallback paths.

**Files**
- `backend/tests/test_compaction_v2.py` (new)

**Acceptance Criteria**
- No regressions in existing compaction thresholds/retention behavior.

---

## Epic D — Dream Runtime V2

### P021-D01 — Dream context assembler v2
**Estimate:** 1.5d
**Depends on:** P021-A01

**Scope**
- Build blended context composer:
  - recent messages (configurable max)
  - room summary (optional)
  - memory hits (optional)
  - lived experience
- Emit context metadata for logging.

**Files**
- `backend/services/dreams/runtime.py`
- optional: `backend/services/dreams/context_builder.py` (new)

**Acceptance Criteria**
- Context respects all flag caps and toggles.
- Metadata includes message_count/summary_used/memory_hits_count.

---

### P021-D02 — Dream prompt v2 and response schema extension
**Estimate:** 1d
**Depends on:** P021-D01

**Scope**
- Upgrade dream prompt language and expected JSON fields (`salient_threads`, `confidence`).
- Keep backward compatibility if model omits new optional fields.

**Files**
- `backend/services/dreams/runtime.py`

**Acceptance Criteria**
- Existing deltas still parsed/clamped.
- Missing optional keys do not fail execution.

---

### P021-D03 — Lived experience cap/guardrail upgrade
**Estimate:** 0.5d
**Depends on:** P021-D02

**Scope**
- Move hardcoded lived_experience cap to config.
- Add anti-rumination cooldown guard using recent negative event checks.

**Files**
- `backend/services/dreams/runtime.py`
- `backend/services/dreams/scheduler.py` (if reuse helper needed)

**Acceptance Criteria**
- Cap follows env var.
- Cooldown suppresses repeated negative over-adjustments.

---

### P021-D04 — Dream v2 integration tests
**Estimate:** 1d
**Depends on:** P021-D03

**Scope**
- Tests for blended context assembly and safe parsing.
- Trigger reason coverage: time/session/event.

**Files**
- `backend/tests/test_dream_runtime_v2.py` (new)
- `backend/tests/test_dream_scheduler_v2.py` (new)

**Acceptance Criteria**
- Stable deterministic test results with mocked provider calls.

---

## Epic E — Emotional Continuity Re-anchor

### P021-E01 — Add soft re-anchor mode in emotion runtime
**Estimate:** 1d
**Depends on:** P021-A01

**Scope**
- Replace hard reset branch with mode switch:
  - `hard`: current behavior
  - `soft`: lerp to baseline with gap-scaled alpha

**Files**
- `backend/services/emotion_runtime.py`
- optional: `backend/services/emotion_engine.py` (helper math)

**Acceptance Criteria**
- Hard mode exactly matches current semantics.
- Soft mode preserves continuity while trending toward baseline.

---

### P021-E02 — Re-anchor unit tests
**Estimate:** 0.75d
**Depends on:** P021-E01

**Scope**
- Test alpha selection by elapsed gap.
- Test clamp and numeric stability.

**Files**
- `backend/tests/test_emotion_reanchor.py` (new)

**Acceptance Criteria**
- Deterministic outputs for short/long gap scenarios.

---

## Epic F — Optional Memory Auto-Capture (Default Off)

### P021-F01 — Auto-capture extractor service
**Estimate:** 2d
**Depends on:** P021-A01

**Scope**
- Extract preference/commitment/date candidates from turn pairs.
- Add dedupe (hash + similarity heuristic) and daily cap.

**Files**
- `backend/services/memory/auto_capture.py` (new)

**Acceptance Criteria**
- Service returns ranked candidates with confidence.
- Dedupe prevents repeated writes for same fact.

---

### P021-F02 — Auto-capture write path wiring
**Estimate:** 1d
**Depends on:** P021-F01

**Scope**
- Wire service into post-turn flow behind feature flag.
- Write to daily memory files using existing writer constraints.

**Files**
- `backend/services/room_chat_stream.py`
- `backend/routers/chat.py`
- `backend/services/memory/writer.py` (only if helper needed)

**Acceptance Criteria**
- Disabled flag => zero writes.
- Enabled flag => bounded writes with source stamps.

---

### P021-F03 — Auto-capture tests and safety checks
**Estimate:** 1d
**Depends on:** P021-F02

**Scope**
- Validate daily limit, confidence threshold, dedupe, and path safety.

**Files**
- `backend/tests/test_memory_auto_capture.py` (new)

**Acceptance Criteria**
- No unsafe path writes.
- Writes stay within configured cap.

---

## Epic G — Schema and Migration Enhancements (Optional)

### P021-G01 — Add optional summary metadata columns
**Estimate:** 0.75d
**Depends on:** P021-C03

**Scope**
- Add `rooms.summary_style`, `rooms.summary_version` via additive migration.

**Files**
- `backend/db/connection.py`
- `backend/db/migrations/*` (new migration)

**Acceptance Criteria**
- Existing DB migrates without data loss.
- Reads/writes compatible with old rows.

---

### P021-G02 — Add optional dream log metadata columns
**Estimate:** 0.75d
**Depends on:** P021-D03

**Scope**
- Add `dream_log.input_context_meta`, `dream_log.safety_flags`.

**Files**
- `backend/db/connection.py`
- `backend/db/migrations/*` (new migration)

**Acceptance Criteria**
- Dream runtime can persist metadata when present.
- Legacy rows remain readable.

---

## Epic H — Rollout, Canary, and Validation

### P021-H01 — Canary rollout for persona compaction + autorecall
**Estimate:** 1d
**Depends on:** P021-B03, P021-C04

**Scope**
- Enable flags for small allowlist of agents.
- Collect 7-day metrics and transcript samples.

**Files**
- runtime env config/deploy manifests
- optional docs update in `docs/planning/`

**Acceptance Criteria**
- No severity-1 regressions in chat path.
- Metrics indicate acceptable token/latency increase.

---

### P021-H02 — Canary rollout for dream v2 + soft re-anchor
**Estimate:** 1d
**Depends on:** P021-D04, P021-E02

**Scope**
- Enable dream v2 and soft re-anchor for same or smaller cohort.
- Evaluate continuity and emotional stability.

**Acceptance Criteria**
- No runaway trust/attachment excursions.
- Qualitative review passes on continuity rubric.

---

### P021-H03 — Exit review and default update decision
**Estimate:** 0.5d
**Depends on:** P021-H01, P021-H02

**Scope**
- Final review against P021 pass criteria.
- Decide defaults for next release.

**Acceptance Criteria**
- Signed decision log with chosen defaults and rollback plan.

---

## Suggested Sprint Grouping

### Sprint 1 (low-risk foundation)
- P021-A01, A02, B01, B02, C01

### Sprint 2 (stabilize and test)
- B03, C02, C03, C04, E01, E02

### Sprint 3 (dream v2)
- D01, D02, D03, D04

### Sprint 4 (optional + rollout)
- F01, F02, F03, G01, G02, H01, H02, H03

---

## Ready-to-Start Queue (Top 5)

1. P021-A01 — Add realism feature flags to config
2. P021-B01 — Implement TopOfMindRecallService
3. P021-B02 — Wire autorecall into room chat pipeline
4. P021-C01 — Compaction prompt v2 builder
5. P021-A02 — Add realism metrics/log schema

These five provide the fastest path to visible realism gains with manageable risk.
