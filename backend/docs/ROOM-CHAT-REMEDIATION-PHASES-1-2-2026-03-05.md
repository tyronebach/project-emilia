# Room Chat Remediation (Phases 1-2) - 2026-03-05

## Scope

This document captures the implemented remediation from the backend review for:

- Phase 1: stream reliability in `services/room_chat_stream.py`
- Phase 2: prompt pipeline cleanup in `services/room_chat.py`

## Phase 1: Stream Reliability

### What changed

- Added explicit single-retry policy for provider stream failures:
  - Retry once for `HTTP 429`
  - Retry once for `HTTP 5xx`
  - Retry once for `httpx.TimeoutException`
- Added short retry backoff with jitter to reduce retry storms.
- Normalized provider errors emitted via `agent_error` SSE payload:
  - `error` (existing field, preserved)
  - `error_code` (new, stable machine field)
  - `retryable` (new, indicates transient/retryable class)
  - `status_code` (new, HTTP status when available)
- Replaced scattered provider-exception branches with a single normalized error path.
- Added debug logging for ignored/unknown stream chunk types to avoid silent drop behavior.

### Backward compatibility

- SSE event names are unchanged: `agent_start`, `agent_done`, `agent_error`, `avatar`, `emotion`, final `done` data event.
- Existing `error` text remains present in `agent_error` payloads.
- Existing rollback behavior is preserved:
  - `successful_replies == 0` and `user_msg_id` => user message rollback.
  - `successful_replies > 0` => compaction scheduling.

### Rationale

- 5xx/429/timeouts are usually transient and benefit from one in-band retry.
- 4xx errors are deterministic request/provider issues and should fail fast without retry.
- Structured error payloads keep frontend behavior stable while enabling better UX and analytics.

## Phase 2: Prompt Pipeline Cleanup

### What changed

- Introduced deterministic `PromptBuilder` in `services/room_chat.py`.
- Updated `prepare_agent_turn_context` to compose prompts via builder order instead of ad hoc mutation chain.
- Composition order is explicit and deterministic:
  1. Base room/system/history prompt
  2. Top-of-mind context insertion
  3. First-turn context augmentation
  4. Game context augmentation (with trusted prompt instructions)

### Behavior parity notes

- Final prompt shape remains equivalent for existing tests and runtime behavior.
- Top-of-mind remains inserted as system context near the latest user turn.
- First-turn and game context remain applied to the latest user message content.

### Rationale

- Deterministic composition removes ordering ambiguity from mutation helpers.
- The prompt assembly flow is easier to audit and extend without hidden side effects.

## Test Coverage Added

New focused tests in `backend/tests/test_room_chat_stream_errors.py`:

- `HTTP 500` stream failure retries once and succeeds.
- `HTTP 400` stream failure does not retry and emits `agent_error` with structured fields.
- Timeout failure retries once and succeeds.

## Phase 3: Runtime Consolidation (implemented)

### What changed

- Replaced `services/chat_runtime/*` stubs with active implementations:
  - `chat_runtime.context.build_context()` now resolves room agents, responding agents, and Games V2 runtime payload gating.
  - `chat_runtime.pipeline.process_message()` now executes the shared room-turn pipeline for stream and non-stream flows.
- Updated `routers/rooms.py` to delegate room chat execution to `chat_runtime.pipeline.process_message()`.
- Kept router-level dependency injection so existing route tests and monkeypatches remain stable.

### Why this is Phase 3

- Removes the previous split-brain state where `chat_runtime` existed only as placeholders while `routers/rooms.py` carried full orchestration.
- Establishes a single room execution service path that routers call into.

## Phase 5 Target (approved)

Memory auto-capture moves from regex heuristics to a neutral structured extractor.

### Target design

- Use a neutral LLM extraction pass for post-turn user facts.
- Require strict JSON output schema:
  - `items[]` with `kind`, `memory`, `confidence`
- Backend remains the only writer and enforces:
  - confidence threshold
  - daily caps
  - dedupe by content hash
  - bounded memory length
- No regex-only extraction path as primary behavior.

### Why

- Reduces brittle false positives from pattern matching.
- Handles negation and nuanced phrasing better than regex.
- Keeps safety and determinism at the backend policy layer.

