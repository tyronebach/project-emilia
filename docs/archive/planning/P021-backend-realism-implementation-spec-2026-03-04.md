# P021 — Backend Realism Implementation Spec (Memory + Dreams + Drift)

Date: 2026-03-04
Scope: **Backend only** (no frontend changes)

---

## 1) Objective

Increase long-horizon relational realism (weeks/months) without destabilizing current chat quality.

Target outcomes:
- Agent continuity feels personal and textured, not generic.
- Emotional and relational consequences persist across sessions.
- Memory recall is proactive but low-noise.
- Compaction preserves narrative flavor while remaining factual.

---

## 2) Current-State Findings (Grounded in Code)

### Strengths
- Canon + lived experience are already injected into runtime system prompt via native provider path.
- Emotional engine persists relationship dimensions and applies decay + trigger calibration.
- Dream scheduler/runtime exists and updates lived experience + relationship deltas.
- Hybrid memory retrieval (vector + FTS) is implemented.

### Primary bottlenecks
1. **Compaction is neutral and texture-lossy**
   - Current prompt is factual/neutral; this gradually flattens personality in long histories.
2. **No backend “top-of-mind” auto recall in chat assembly**
   - Memory retrieval depends on LLM choosing tools.
3. **Dream context window is shallow**
   - Recent-message slice is small; dream synthesis can miss slow-burn arcs.
4. **Session reset of V/A/D can feel discontinuous across days**
   - Relationship dimensions persist, but emotional carryover can feel abrupt.
5. **Workspace event milestones are environment-gated**
   - In standalone mode, this continuity source may be disabled.

---

## 3) Design Principles

- **Canon is immutable anchor; experience is mutable narrative.**
- **Factual core + emotional texture** in all long-term summaries.
- **Retrieval should be sparse and high-confidence, not constant spam.**
- **Backend determinism first** (budget limits, thresholds, schemas, audits).
- **Safe rollout via flags** with per-agent allowlists.

---

## 4) Proposed Architecture Changes

## A. Proactive Memory Recall (“Top of Mind”) in Chat Pipeline

### Goal
Inject a small, high-relevance memory block into prompt assembly before LLM call.

### Files
- `backend/services/room_chat.py`
- `backend/services/memory/search.py`
- `backend/config.py`
- `backend/services/llm_caller.py` (if helper wiring is cleaner there)

### New behavior
On each incoming user message (non-runtime-trigger):
1. Run semantic search against agent/user memory.
2. Apply gate policy:
   - minimum score threshold
   - recency diversity cap
   - token budget cap
3. If passing, inject **one compact system block** before user message:

```text
## Top-of-Mind Recollections
- [score 0.91 | MEMORY.md] User prefers direct feedback over reassurance.
- [score 0.88 | memory/2026-02-28.md] User felt ignored when responses were delayed.
Use naturally if relevant. Do not force references.
```

### Config (new env)
- `MEMORY_AUTORECALL_ENABLED=1`
- `MEMORY_AUTORECALL_SCORE_THRESHOLD=0.86`
- `MEMORY_AUTORECALL_MAX_ITEMS=2`
- `MEMORY_AUTORECALL_MAX_CHARS=420`
- `MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED=0`

### Acceptance criteria
- Median prompt token increase stays within configured budget.
- No >10% rise in repeated-memory complaints (tracked via logs/manual eval set).
- Tool-based memory usage still works unchanged.

---

## B. Persona-Driven Compaction (Texture-Preserving Summaries)

### Goal
Replace neutral-only compaction with agent-aware style while preserving factual reliability.

### Files
- `backend/services/compaction.py`
- `backend/services/room_chat_stream.py`
- `backend/db/repositories/room_repository.py` (if metadata storage needed)
- `backend/config.py`

### Prompt strategy
Use a two-layer instruction:
1. **Factual Backbone** (events, preferences, commitments, unresolved threads).
2. **Perspective Layer** (what mattered emotionally to this agent persona).

If room type is `group`, run **neutral compaction fallback** unless explicitly enabled for multi-agent.

### Output format (structured text for now)
```text
### Facts
- ...
### Emotional Texture (Agent Perspective)
- ...
### Open Threads
- ...
### Stable User Preferences
- ...
```

### Config (new env)
- `COMPACTION_PERSONA_MODE=off|dm_only|all` (default: `dm_only`)
- `COMPACTION_TEXTURE_MAX_LINES=6`
- `COMPACTION_OPEN_THREADS_MAX=5`
- `COMPACTION_MODEL=<existing compact model default>`

### Safety constraints
- Never fabricate facts not present in source messages.
- Preserve explicit user commitments/dates as high-priority items.
- Keep summary deterministic enough for repeated compactions.

### Acceptance criteria
- Longitudinal eval shows reduced “generic assistant drift”.
- Critical factual recall remains at parity or better vs current neutral compaction.

---

## C. Dream Runtime Upgrade (Narrative Digestion)

### Goal
Dreams should process longer arcs and update lived experience with durable texture.

### Files
- `backend/services/dreams/runtime.py`
- `backend/services/dreams/scheduler.py`
- `backend/config.py`

### Changes
1. Expand dream input context from only recent messages to blended context:
   - latest turns
   - current room summary
   - optional top memory hits
   - prior lived experience
2. Strengthen prompt role:
   - reflective internal processing from agent perspective
   - explicit distinction: canon constraints vs mutable interpretation
3. Expand lived_experience capacity (current cap likely too restrictive for months-long arcs).
4. Add lightweight anti-ruminative guard:
   - prevent over-amplifying a single negative episode.

### Config (new env)
- `DREAM_CONTEXT_MAX_MESSAGES=60`
- `DREAM_INCLUDE_ROOM_SUMMARY=1`
- `DREAM_INCLUDE_MEMORY_HITS=1`
- `DREAM_MEMORY_HITS_MAX=3`
- `DREAM_LIVED_EXPERIENCE_MAX_CHARS=2400`
- `DREAM_NEGATIVE_EVENT_COOLDOWN_HOURS=12`

### Acceptance criteria
- Dream logs show coherent progression over multiple sessions.
- Relationship deltas remain bounded and explainable.
- No runaway polarity in trust/attachment due to single events.

---

## D. Emotional Continuity Tuning (Session Boundary Behavior)

### Goal
Maintain believable emotional carryover across sessions while avoiding stale mood lock-in.

### Files
- `backend/services/emotion_runtime.py`
- `backend/services/emotion_engine.py`
- `backend/config.py`

### Changes
- Replace hard V/A/D reset-at-session-start with weighted re-anchor:
  - `state = lerp(current_state, baseline, reanchor_alpha)`
- Keep relationship dimensions persistent as today.
- Scale re-anchor by elapsed time (longer gap => stronger baseline pull).

### Config (new env)
- `EMOTION_SESSION_REANCHOR_MODE=hard|soft` (default: `soft`)
- `EMOTION_REANCHOR_ALPHA_SHORT_GAP=0.25`
- `EMOTION_REANCHOR_ALPHA_LONG_GAP=0.60`
- `EMOTION_REANCHOR_LONG_GAP_HOURS=24`

### Acceptance criteria
- Lower incidence of abrupt mood discontinuity reports.
- No excessive emotional inertia after long inactivity.

---

## E. Memory Write Reliability (Reduce tool-only dependence)

### Goal
Ensure important continuity facts are persisted even if LLM omits `memory_write`.

### Files
- `backend/services/room_chat_stream.py`
- `backend/services/room_chat.py`
- `backend/services/memory/writer.py`
- optional new: `backend/services/memory/auto_capture.py`

### Changes
Add optional backend post-turn extractor:
- heuristically detect candidate facts (preferences, important dates/events, explicit commitments)
- write to daily memory file with source stamp
- dedupe by hash + semantic similarity window

### Config (new env)
- `MEMORY_AUTOCAPTURE_ENABLED=0` (start off)
- `MEMORY_AUTOCAPTURE_MAX_ITEMS_PER_DAY=8`
- `MEMORY_AUTOCAPTURE_MIN_CONFIDENCE=0.82`

### Acceptance criteria
- Higher persistence rate of key facts in audit samples.
- Low false-positive writes (manual spot-check threshold).

---

## 5) Data Model Changes

## Minimal schema additions (Phase 1-safe)

### `rooms` table metadata (optional but recommended)
- `summary_style TEXT NULL` (`neutral` / `persona_dm`)
- `summary_version INTEGER NOT NULL DEFAULT 1`

### `dream_log` table (optional enhancements)
- `input_context_meta TEXT NULL` (JSON: message_count, used_summary, memory_hits)
- `safety_flags TEXT NULL` (JSON)

Migration approach:
- additive columns only
- no destructive migrations
- defaults preserve current behavior

---

## 6) Prompt Contracts (Versioned)

## `CompactionPromptV2`
Inputs:
- agent display name
- canon excerpt (bounded)
- existing summary
- old messages slice
- room type

Output sections:
- facts
- texture
- open_threads
- stable_preferences

## `DreamPromptV2`
Inputs:
- canon
- lived_experience_before
- relationship state
- blended context (messages + summary + memory snippets)
- trigger reason

Output JSON:
```json
{
  "lived_experience_update": "...",
  "relationship_adjustments": {
    "trust_delta": 0.0,
    "attachment_delta": 0.0,
    "intimacy_delta": 0.0
  },
  "internal_monologue": "...",
  "salient_threads": ["..."],
  "confidence": 0.0
}
```

---

## 7) Rollout Plan

## Phase 0 — Instrumentation only (no behavior changes)
- Add logs/metrics for compaction quality, dream context size, memory tool usage.
- Add eval harness fixture set (longitudinal transcripts).

## Phase 1 — Persona Compaction (DM only)
- Enable `COMPACTION_PERSONA_MODE=dm_only` for small agent allowlist.
- Compare against control on factual recall + texture score.

## Phase 2 — Top-of-Mind Recall
- Enable autorecall with strict threshold and budget caps.
- Monitor repetition/noise metrics.

## Phase 3 — Dream V2
- Expand context blend and lived_experience cap.
- Validate drift stability and narrative coherence.

## Phase 4 — Emotional Re-anchor Soft Mode
- Roll out soft re-anchor with conservative alpha values.

## Phase 5 — Optional Auto-capture
- Keep off by default; run per-agent experiments.

---

## 8) Observability & Evaluation

## New metrics
- `compaction_chars_before/after`
- `compaction_texture_lines`
- `dream_context_message_count`
- `dream_used_summary` (bool)
- `dream_used_memory_hits` (count)
- `autorecall_hit_count`
- `autorecall_injected_chars`
- `memory_write_tool_calls_per_100_turns`

## Offline eval set
Create a fixed 6–12 week synthetic/real anonymized transcript suite with checks:
- preference continuity
- unresolved thread recall
- emotional consequence persistence
- persona consistency under stress

Pass criteria (initial):
- +20% continuity score vs baseline
- no regression in factual precision >2%
- no increase in hallucinated memories above baseline tolerance

---

## 9) Test Plan

Unit tests:
- compaction prompt builder mode selection (neutral vs persona DM)
- autorecall gating/threshold/budget behavior
- dream context assembler blending logic
- emotion soft re-anchor math at session boundaries

Integration tests:
- DM chat -> compaction -> next-turn summary utilization
- dream trigger path with event/session/time triggers
- memory autorecall injection appears only above threshold

Regression tests:
- existing room chat SSE behavior unchanged
- tool loop memory APIs unchanged
- old env defaults keep legacy behavior

---

## 10) Risks & Mitigations

1. **Prompt bloat / latency increase**
   - strict char budgets, per-feature caps, canary rollout
2. **Memory noise from autorecall**
   - high threshold + diversity constraints + skip on runtime triggers
3. **Persona bias corrupting factual summaries**
   - factual-first output schema + parser validation
4. **Overfitting dreams to recent events**
   - blended context + anti-rumination cooldown
5. **Behavioral regressions in group rooms**
   - default DM-only persona compaction

---

## 11) Implementation Task Breakdown (Backend)

1. Add config flags + defaults (`config.py`).
2. Implement `TopOfMindRecallService` (new helper under `services/memory/`).
3. Wire recall injection into room message builder path.
4. Implement `CompactionServiceV2` prompt builder and mode gate.
5. Add parser/validator for structured compaction output.
6. Upgrade dream context assembler + prompt v2 + output validation.
7. Add soft re-anchor branch in emotion runtime.
8. Add metrics logging hooks.
9. Add unit + integration tests.
10. Run canary rollout for selected agents.

---

## 12) Explicit Non-Goals (for this spec)

- Frontend UX changes.
- New game mechanics.
- Replacing current memory storage backend.
- Multi-agent persona-differentiated group compaction in first rollout.

---

## 13) Decision Log Required Before Build

Before implementation starts, finalize:
1. Autorecall score threshold default (`0.86` proposed).
2. Persona compaction mode default (`dm_only` proposed).
3. Lived experience cap (`2400` proposed).
4. Emotion re-anchor mode default (`soft` proposed).
5. Whether auto-capture launches in this cycle (default `off`).

---

## 14) Quick-Start Recommended Defaults (First Iteration)

```env
COMPACTION_PERSONA_MODE=dm_only
MEMORY_AUTORECALL_ENABLED=1
MEMORY_AUTORECALL_SCORE_THRESHOLD=0.86
MEMORY_AUTORECALL_MAX_ITEMS=2
MEMORY_AUTORECALL_MAX_CHARS=420
DREAM_CONTEXT_MAX_MESSAGES=60
DREAM_INCLUDE_ROOM_SUMMARY=1
DREAM_INCLUDE_MEMORY_HITS=1
DREAM_MEMORY_HITS_MAX=3
DREAM_LIVED_EXPERIENCE_MAX_CHARS=2400
EMOTION_SESSION_REANCHOR_MODE=soft
MEMORY_AUTOCAPTURE_ENABLED=0
```

This provides highest expected realism gain with limited operational risk.

---

## 15) Detailed Implementation Ticket List

For execution planning, see:
- `docs/planning/P021-implementation-ticket-list-2026-03-04.md`
- `docs/planning/P021-rollout-runbook-2026-03-04.md`
