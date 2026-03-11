# Ruthless Backend Code Review: project-emilia

## 1. Executive Summary
- **Split Brain Architecture:** Chat logic is fractured between a legacy `room_chat.py` (active) and a stubbed `chat_runtime/` (planned), causing confusion and technical debt.
- **Emotion Engine Bloat:** `emotion_engine.py` is a 61KB monolith mixing V1/V2 logic, hardcoded taxonomies, and over-engineered Bayesian calibration that likely yields noise.
- **Fake "AI" Memory:** `auto_capture.py` relies on 1990s-style regex matching (`i like`, `i plan to`) to claim "memory", ensuring the database fills with low-quality noise.
- **Fragile Fallbacks:** Streaming loops swallow HTTP errors with `continue`, potentially leaving users hanging or desynchronized without proper state recovery.
- **Prompt Injection Chaos:** Prompts are assembled via fragile list mutations (`inject_..._if_present`) rather than a deterministic pipeline, risking context window overruns and ordering bugs.
- **Hardcoded "Magic":** Massive dictionaries (like `DEFAULT_TRIGGER_DELTAS`) and persona prompts (Roswaal) are hardcoded in Python, making behavior tuning require code deploys.
- **Config Sprawl:** A/B testing flags (`games_v2`, `sarcasm_mitigation`) are permanent fixtures, increasing the testing surface area unnecessarily.
- **Testing Gaps:** No evidence of deterministic state testing for the emotion engine; relying on "vibes" rather than regression tests for emotional continuity.

## 2. High-Impact Issues (P0/P1)

### P0: Regex-Based Memory Pollution
- **File:** `backend/services/memory/auto_capture.py` (`maybe_autocapture_memory`, `_candidate_facts`)
- **Why:** Uses naive regex (`_PREFERENCE_RE`, `_DATE_RE`) to identify user facts. A user saying "I don't like x" might trigger "preference: I don't like x", or "I'm not going to..." triggers commitment.
- **Refactor:** Delete `auto_capture.py` entirely. Replace with a structured LLM extraction call (using a small, cheap model like `gpt-4o-mini` or local `llama3`) that returns strictly typed JSON facts.
- **Risk:** Database fills with garbage "facts", degrading long-term coherence and confusing the agent.

### P0: Silent Stream Failures
- **File:** `backend/services/room_chat_stream.py` (`stream_room_chat_sse`)
- **Why:** The `except httpx.HTTPStatusError` block catches critical provider failures, yields an `agent_error` event, and then `continue`s. In a DM, this looks like a crash. In a group, it desyncs the conversation state.
- **Refactor:** Implement a proper retry backoff for 5xx errors. For 4xx (client) errors, fail the turn explicitly and return a system message to the user explaining the failure. Do not blindly `continue`.
- **Risk:** User sends a message, sees a spinner, then nothing happens. The agent state remains stuck or divergent.

### P1: Emotion Engine Monolith & V1/V2 Mixing
- **File:** `backend/services/emotion_engine.py`
- **Why:** 61KB file. Mixes simple decay logic with complex, unverified "Bayesian smoothing" (`TriggerCalibration`). Hardcodes `DEFAULT_TRIGGER_DELTAS` (GoEmotions taxonomy).
- **Refactor:**
    1. Extract `DEFAULT_TRIGGER_DELTAS` to a JSON/YAML config file.
    2. Split `EmotionEngine` into `EmotionStateCalculator` (deterministic) and `EmotionInference` (ML/heuristics).
    3. Delete `infer_outcome_multisignal` (emoji guessing) – it's unreliable "slop".
- **Risk:** Impossible to tune emotional dynamics without code changes. "V2" logic adds computation overhead without proven value over V1.

### P1: Dependency Injection Overkill
- **File:** `backend/services/room_chat.py` (`prepare_agent_turn_context`)
- **Why:** Takes ~15 arguments, half of which are functions passed in (e.g., `is_games_v2_enabled_for_agent_fn`). This is defensive programming gone wrong.
- **Refactor:** Import services directly or use a lightweight container. Remove dynamic function passing for static config checks.
- **Risk:** Debugging is a nightmare; stack traces are convoluted.

## 3. Structural Simplification Plan

1.  **Consolidate Chat Runtime:**
    *   **Action:** Move `room_chat.py` logic *into* `chat_runtime/` as the default implementation.
    *   **Action:** Delete the `NotImplementedError` stub in `pipeline.py`.
    *   **Action:** Standardize one pipeline for both Room and DM chat.

2.  **Purge "Magic" Constants:**
    *   **Action:** Move `DEFAULT_TRIGGER_DELTAS` (emotion_engine.py) and `ARCHETYPE_PERSONAS` (soul_simulator.py) to `backend/data/` as JSON/YAML files. Load them at startup.

3.  **Simplify Emotion Engine:**
    *   **Action:** Remove `ContextualTriggerCalibration`, `TriggerCalibration`, and `infer_outcome_multisignal`.
    *   **Rationale:** These are unproven complexities. Revert to a robust, deterministic V1 model (Base + Trigger Deltas + Decay) until V1 is proven insufficient.

4.  **Fix Memory Pipeline:**
    *   **Action:** Replace `auto_capture.py` regex logic with a structured LLM extraction step.

## 4. Duplicate/Redundant Code Map

| Logic | Locations | Recommendation |
| :--- | :--- | :--- |
| **Chat Execution** | `backend/services/room_chat.py` (Active) <br> `backend/services/chat_runtime/` (Stub) | Delete stub. Rename `room_chat.py` to `chat_runtime/core.py` and refactor into a class-based pipeline. |
| **System Prompts** | `room_chat.py` (`_build_room_system_context`) <br> `soul_simulator.py` (Judge prompts) | Centralize all system prompt templates into `backend/prompts/`. |
| **Trigger Logic** | `apply_trigger` vs `apply_trigger_calibrated` (`emotion_engine.py`) | Merge. Calibration should be a modifier passed to the single `apply_trigger` method, not a separate path. |
| **Sentiment Guessing** | `infer_outcome_multisignal` (`emotion_engine.py`) | Delete. It relies on emoji detection (`\U0001f602`) which is brittle and culturally specific. |

## 5. Fake Fallback Audit

-   **`room_chat_stream.py` -> `stream_room_chat_sse`**: `except httpx.HTTPStatusError: continue`.
    *   **Fix:** Remove `continue`. If a provider fails, log it, attempt **one** retry if 5xx, otherwise raise or return a structured error object that the frontend can render as "Service Busy".
-   **`emotion_engine.py` -> `get_trigger_classifier`**: Import fallback chain (package vs file).
    *   **Fix:** Fix the PYTHONPATH or import structure. Do not ship production code that guesses how it was imported.
-   **`room_chat.py` -> `determine_responding_agents`**: "Mention-only room: return first agent to avoid dead-end UX."
    *   **Fix:** Do not return a random agent. If no one is mentioned in a mention-only room, return **no one**. The UI should handle the "no reply" state.

## 6. Prompt Coherence Audit

-   **Current State:** Prompts are built by concatenating list items in `room_chat.py` with helper functions injecting strings at the end.
-   **Problem:** No single view of the final prompt. `inject_game_context_if_present` modifies the *last user message*, which effectively hides the game context from the system prompt history.
-   **Proposal:**
    *   Create `PromptBuilder` class.
    *   `builder.add_system(text)`
    *   `builder.add_history(messages)`
    *   `builder.add_context(context_type, content)` (explicit section, not hidden in user msg).
    *   `builder.build()` returns the final list.
    *   **Crucial:** "Roswaal" judge prompt in `soul_simulator.py` should be replaced with a standard, objective evaluator prompt for production reliability.

## 7. Config Surface Cleanup

| Flag | Status | Recommendation |
| :--- | :--- | :--- |
| `GAMES_V2_AGENT_ALLOWLIST` | **Kill** | Either V2 is ready or it isn't. Feature flagging individual agents is maintenance debt. Enable globally or disable. |
| `SARCASM_MITIGATION_ENABLED` | **Kill** | If this works, it should be core logic. If it's experimental, finish the experiment. Don't leave it as a permanent toggle. |
| `COMPACTION_PERSONA_MODE` | **Keep** | Valid preference. |
| `MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED` | **Kill** | Over-granular. If autorecall is on, it should work for triggers too. |
| `TRIGGER_CLASSIFIER_CONFIDENCE` | **Keep** | Tuning parameter. |

## 8. Test Gaps

-   **Emotion Determinism:** No tests prove that `Sequence[Triggers] -> State` is deterministic.
    *   *Add:* `tests/test_emotion_determinism.py`: Run the same sequence of 50 triggers twice. Assert final `EmotionalState` floats match exactly.
-   **Chat Pipeline Error Handling:** No tests for when the LLM provider returns 500 or times out.
    *   *Add:* `tests/test_chat_failure_modes.py`: Mock `httpx` to raise `HTTPStatusError` and assert the system returns a graceful error state, not a hanged stream.
-   **Memory Garbage Collection:** No tests for what happens when `auto_capture` fills the daily limit with junk.
    *   *Add:* `tests/test_memory_limits.py`: Verify behavior when daily memory file is full.

## 9. "Do Not Touch" List

-   **`backend/services/direct_llm.py`**: Seems to be a stable wrapper around provider logic.
-   **`backend/db/repositories/`**: Standard CRUD patterns appear consistent and safe.
-   **`backend/services/compaction.py`**: The logic for summarizing rooms seems sound and isolated.
