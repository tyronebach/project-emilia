# Backend Code Review — Emilia Companion Simulator

**Date**: 2026-03-04
**Scope**: Backend only
**Reviewer**: Senior-level automated review (Claude Opus 4.6)

---

## 1. Executive Summary

1. **The chat pipeline (non-stream) is copy-pasted three times** — `routers/chat.py` non-stream, `routers/rooms.py` non-stream, and `services/room_chat_stream.py` SSE stream. Each copy independently builds context, injects memories, dispatches post-LLM hooks, handles milestones. Divergence is inevitable and already occurring.
2. **`_extract_content()` is reimplemented 4 times** in `compaction.py`, `llm_client.py`, `soul_simulator.py`, and `dreams/runtime.py` with subtly different error handling.
3. **Time-of-day logic is duplicated** between `chat_context_runtime.py` `_time_of_day_bucket()` and `direct_llm.py` `_get_time_block()` — both compute the same 4-bucket split independently.
4. **Canon/SOUL.md loading is duplicated** between `direct_llm.py` `load_workspace_soul_md()`/`load_canon_soul_md()` and `dreams/runtime.py` `_load_canon()` — same file-read-and-extract, different error semantics.
5. **Lived experience is loaded by 2 unrelated paths**: `direct_llm.py` `_load_lived_experience()` (returns str, inline SQL) and `dreams/runtime.py` `_load_lived_experience()` (returns dict, upserts on miss). Neither uses a repository method.
6. **Session gap constant is defined twice** — `_SESSION_GAP_SECONDS = 7200` in both `emotion_runtime.py` and `dreams/scheduler.py`. Changing one forgets the other.
7. **`_call_legacy_openclaw_non_stream()`** in `rooms.py` is dead code — `OpenClawProvider` now raises `NotImplementedError`, but the rooms router still catches `ValueError("OPENAI_API_KEY is required")` and falls back to it, creating a double-failure path.
8. **The `chat.py` non-stream path and `rooms.py` non-stream path share ~120 lines of identical orchestration** that will silently diverge as features are added to one but not the other.
9. **Compaction fallback in `compaction.py`** silently retries with the neutral prompt when persona-mode fails validation — this hides broken persona prompts and degrades summary quality without alerting anyone.
10. **Emotion pre-LLM `except Exception: return None, []`** in `emotion_runtime.py` swallows all errors, meaning a DB schema drift or serialization bug would silently remove emotional context from every response — destroying realism with no signal.
11. **`workspace` guard pattern `isinstance(agent_workspace, str) and agent_workspace.strip()`** is repeated 6 times across 3 files. Should be a single predicate.
12. **No tests exist for** the streaming SSE path, dream scheduling logic, memory auto-capture integration, or compaction persona-mode output validation.

---

## 2. High-Impact Issues (P0/P1)

### P0-1: Three copies of chat orchestration logic

- **Files**: `routers/chat.py` `chat()`, `routers/rooms.py` `room_chat()`, `services/room_chat_stream.py` `stream_room_chat_sse()`
- **Why it's a problem**: Each independently builds LLM messages, injects top-of-mind, first-turn, game context, calls emotion pre/post-LLM, fires autocapture, fires milestones, fires compaction. When a new context source is added (e.g., a new memory layer), it must be added to 3 places. The non-stream `chat()` in `chat.py` and `room_chat()` in `rooms.py` are nearly line-for-line identical except for response schema wrapping.
- **Concrete fix**: Extract a single `async def orchestrate_agent_turn(room_id, user_id, agent, message, game_context, runtime_trigger, room_agents) -> AgentTurnResult` function in `services/room_chat.py`. Both routers and the streaming path call it. The streaming path wraps the streaming provider call but uses the same pre/post orchestration.
- **Risk if not fixed**: Feature divergence between DM and group chat. Bugs fixed in one path silently survive in the other. Memory injection changes are already inconsistent between stream and non-stream.

### P0-2: Emotion pre-LLM blanket exception swallowing

- **File**: `services/emotion_runtime.py` line ~265
- **Symbol**: `process_emotion_pre_llm()` — the outer `except Exception: return None, []`
- **Why it's a problem**: If the emotional state table schema drifts, if JSON parsing breaks, if the mood weights serialization changes — every chat response silently loses all emotional context. The agent becomes a flat, context-free LLM with no mood, no trust modulation, no behavioral rules. This is the #1 realism-killing failure mode and it produces zero signal.
- **Concrete fix**: Catch `(json.JSONDecodeError, KeyError, TypeError)` specifically. Let `sqlite3.OperationalError`, `RuntimeError`, and other structural failures propagate. Add a structured log with `logger.error(...)` that includes the exception class so monitoring can alert on it.
- **Risk if not fixed**: Silent total loss of emotional continuity. The user sees a working chat with no idea the companion has lost all personality and memory of the relationship.

### P0-3: Dead OpenClaw fallback in rooms.py

- **File**: `routers/rooms.py` line ~490
- **Symbol**: `except ValueError as exc: if "OPENAI_API_KEY is required" not in str(exc): raise` → falls through to `_call_legacy_openclaw_non_stream()`
- **Why it's a problem**: `OpenClawProvider.generate()` raises `NotImplementedError("OpenClaw provider not available in standalone mode")`. If the native provider fails with a key-missing error, this code catches it, calls OpenClaw, which also fails, returning a confusing double-error. More dangerous: the string match is fragile — if the error message text changes, the fallback activates for unrelated ValueErrors.
- **Concrete fix**: Delete `_call_legacy_openclaw_non_stream()` and the `try/except ValueError` wrapper around `call_llm_non_stream`. Let the ValueError propagate directly. If the user hasn't configured an API key, they should see a clear 503, not a cascade of two failures.
- **Risk if not fixed**: Confusing error messages; masking real configuration failures.

### P1-1: Compaction persona-mode silent fallback

- **File**: `services/compaction.py` line ~130
- **Symbol**: `CompactionService.summarize_messages()` — the validation retry block
- **Why it's a problem**: When persona compaction produces output that fails `_is_structured_summary_valid()`, it silently retries with the neutral prompt. This means a broken persona prompt or a model regression silently degrades every compaction from persona-aware summaries to factual-only summaries. The conversation summary loses emotional texture, open threads, and user preferences — all critical for realism.
- **Concrete fix**: Log a `logger.warning` with the raw summary that failed validation. Metric counter `compaction_persona_fallback`. Still do the fallback (better than crashing), but make it visible.
- **Risk if not fixed**: Gradual, invisible realism erosion in long conversations.

### P1-2: `_load_lived_experience()` duplicated with different semantics

- **Files**: `services/direct_llm.py`, `services/dreams/runtime.py`
- **Why it's a problem**: `direct_llm.py` version returns a `str` (empty if missing). `dreams/runtime.py` version returns a `dict` and auto-creates the row if missing. Two callers with different contracts for the same data. If the schema changes, one will break and the other won't.
- **Concrete fix**: Add `CharacterLivedExperienceRepository.get_or_create(agent_id, user_id) -> dict` and `CharacterLivedExperienceRepository.get_text(agent_id, user_id) -> str` to the repository layer. Have both `direct_llm.py` and `dreams/runtime.py` call the repository.
- **Risk if not fixed**: Schema drift breaks one path silently.

### P1-3: `_message_behavior()` duplicated in two files

- **Files**: `routers/rooms.py` and `services/room_chat_stream.py` — identical function
- **Why it's a problem**: Pure duplication. Already exists as `extract_behavior_dict()` in `room_chat.py`.
- **Concrete fix**: Delete both copies. Import from `services.room_chat.extract_behavior_dict` (which already exists and is identical).
- **Risk if not fixed**: Low immediate risk, but increases maintenance burden.

---

## 3. Structural Simplification Plan (ordered, minimal blast radius)

**Step 1** — Extract `orchestrate_agent_turn()` into `services/room_chat.py`:
- Move the shared pre-LLM setup (first-turn check, emotion pre-LLM, build messages, inject top-of-mind/first-turn/game context) and the shared post-LLM teardown (store message, emotion post-LLM, autocapture, milestones) into a single function.
- Both `chat.py` non-stream and `rooms.py` non-stream call `orchestrate_agent_turn()` → `call_llm_non_stream()`.
- `stream_room_chat_sse()` calls the pre-LLM part of `orchestrate_agent_turn()`, then does its own streaming loop, then calls the post-LLM part.
- **Blast**: Medium. Touches 3 files. Refactor, not rewrite.

**Step 2** — Consolidate `_extract_content()`:
- Create `services/llm_response.py` with one `extract_content(payload: dict) -> str` that raises `ValueError` on missing/malformed content.
- Replace all 4 copies.
- **Blast**: Low. Pure extraction refactor.

**Step 3** — Consolidate canon/lived-experience loading:
- Move `load_canon_soul_md()` and `_load_lived_experience()` to repository layer or a shared `services/agent_context.py`.
- Delete duplicates in `direct_llm.py` and `dreams/runtime.py`.
- **Blast**: Low.

**Step 4** — Consolidate time-of-day:
- Make `_time_of_day_bucket()` the single source. Import it in `direct_llm.py`.
- **Blast**: Trivial.

**Step 5** — Extract `_has_workspace(value) -> bool` predicate:
- Replace 6 occurrences of `isinstance(agent_workspace, str) and agent_workspace.strip()`.
- **Blast**: Trivial.

**Step 6** — Move session gap constant to `config.py`:
- Single `self.session_gap_seconds: int = int(os.getenv("SESSION_GAP_SECONDS", "7200"))`.
- Delete both module-level constants.
- **Blast**: Low.

---

## 4. Duplicate/Redundant Code Map

| Duplicate | Location A | Location B | Location C/D | Action |
|---|---|---|---|---|
| `_extract_content()` | `compaction.py` | `llm_client.py` | `soul_simulator.py`, `dreams/runtime.py` | Merge → `services/llm_response.py` |
| `_message_behavior()` | `routers/rooms.py` | `room_chat_stream.py` | — | Delete both; use `extract_behavior_dict` |
| `_time_of_day_bucket` | `chat_context_runtime.py` | `direct_llm.py` | — | Merge → `chat_context_runtime.py` |
| `_load_canon()` / `load_canon_soul_md()` | `direct_llm.py` | `dreams/runtime.py` | — | Merge → one shared function |
| `_load_lived_experience()` | `direct_llm.py` | `dreams/runtime.py` | — | Merge → repository method |
| `_SESSION_GAP_*` | `emotion_runtime.py` | `dreams/scheduler.py` | — | Merge → `config.py` |
| Chat orchestration loop | `chat.py` non-stream | `rooms.py` non-stream | `room_chat_stream.py` SSE | Merge into `orchestrate_agent_turn()` |
| Workspace guard pattern | 6 occurrences across 3 files | — | — | Extract `has_workspace()` predicate |

---

## 5. Fake Fallback Audit

| Location | Behavior | Verdict |
|---|---|---|
| `emotion_runtime.py` `process_emotion_pre_llm` outer `except Exception` | Returns `None, []` — agent loses all emotional state silently | **REMOVE** blanket catch. Catch only `json.JSONDecodeError, KeyError, TypeError`. Let structural errors propagate. |
| `emotion_runtime.py` `process_emotion_post_llm` outer `except Exception` | Swallows post-LLM state mutation failures | **NARROW** to data-level exceptions. A broken update means calibration learning is lost silently. |
| `compaction.py` persona summary validation → neutral fallback | Hides broken persona prompts | **KEEP** fallback but **ADD** warning log + metric. |
| `room_chat_stream.py` `maybe_compact_room` outer `except Exception` | Returns `{"compacted": False, "error": ...}` | **KEEP** — compaction failure should never kill the chat. Logging is correct. |
| `rooms.py` `except ValueError("OPENAI_API_KEY")` → OpenClaw fallback | Falls into a second failure path that always raises `NotImplementedError` | **DELETE** entirely. Dead code path. |
| `rooms.py` `except httpx.TimeoutException:` / `except Exception:` for per-agent failures | Logs exception and continues to next agent | **KEEP** — correct behavior for multi-agent room; one agent timing out shouldn't kill others. |
| `chat_context_runtime.py` `build_first_turn_context` inner try/excepts | Silently skips interaction facts / upcoming events | **KEEP** — these are best-effort enrichments. Missing them is tolerable; crashing the chat is not. |
| `direct_llm.py` `chat_completion` 400 retry removing temperature | Silently retries API call | **KEEP** with improvement: log `logger.info` on retry so it's visible that the model doesn't support temperature. Current `pass` in `except Exception` after retry is too silent. |

---

## 6. Prompt Coherence Audit

**Current prompt assembly order** (for native provider, DM path):

1. `prepend_webapp_system_prompt()` in `direct_llm.py`: Canon → Lived Experience → Behavioral Rules → Webapp Instructions (time, memory, behavior format)
2. `build_room_llm_messages()` in `room_chat.py`: Room system context ("multi-agent chat") → Emotional context → Room summary → Chat history
3. `inject_top_of_mind_if_present()`: Inserts memory recollections before last user message
4. `inject_first_turn_context_if_present()`: Prepends session facts to last user message
5. `inject_game_context_if_present()`: Appends game state to last user message

**Issues found:**

- **Double time injection**: `_get_time_block()` in the webapp system prompt AND `build_first_turn_context()` both inject the current time. On first turn, the model sees time twice. **Fix**: Remove time from `build_first_turn_context()` since the system prompt always includes it. Or better: make `build_first_turn_context()` only add *delta* information (days_since_last, upcoming events) since the system prompt already provides the current timestamp.

- **Room system context overwrites SOUL.md framing**: The "You are participating in a multi-agent group chat" system message is injected *after* the Canon+SOUL system message. For DM rooms this is misleading — the agent is told it's in a "multi-agent group chat" even for 1:1 conversations. **Fix**: Skip or rephrase `_build_room_system_context()` for DM rooms (room_type == "dm").

- **No single map of what's in the prompt**: The prompt is assembled across 4 files. **Proposal**: Create a `PROMPT_ASSEMBLY.md` doc (or structured comment) that documents the canonical order and which service owns each block. Not a runtime change, but prevents future drift.

---

## 7. Config Surface Cleanup

| Flag | Verdict | Reason |
|---|---|---|
| `MEMORY_AUTORECALL_ENABLED` | **KEEP** | Core feature gate, cleanly gated. |
| `MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED` | **KEEP** | Independent from main recall; legitimate control. |
| `MEMORY_AUTOCAPTURE_ENABLED` | **KEEP** | Core feature gate. |
| `LLM_TRIGGER_DETECTION` / `trigger_classifier_llm_fallback` | **RENAME → DELETE both**. The config creates `self.trigger_classifier_llm_fallback` and `self.llm_trigger_detection` as aliases. But neither is used — the actual classifier enable/disable is `TRIGGER_CLASSIFIER_ENABLED` env var read directly in `EmotionEngine.__init__()`. These two config entries are dead. |
| `COMPACTION_PERSONA_MODE` | **KEEP** | Three valid modes, well-validated. |
| `COMPACT_MODEL` / `SOUL_SIM_PERSONA_MODEL` / `SOUL_SIM_JUDGE_MODEL` | **KEEP** | Independent model selection for different tasks. |
| `EMOTION_SESSION_REANCHOR_MODE` | **KEEP** | Hard vs soft reanchor is a meaningful tuning lever. |
| `GAMES_V2_AGENT_ALLOWLIST` | **KEEP** | Rollout gate. When fully rolled out, delete. |
| `TRIGGER_CLASSIFIER_ENABLED` (env var in EmotionEngine) | **PROMOTE to `config.py`**. Currently read via `os.getenv()` inside `EmotionEngine.__init__()`, bypassing the settings singleton. Move to `settings.trigger_classifier_enabled`. |
| `TRIGGER_CLASSIFIER_CONFIDENCE` (env var in EmotionEngine) | Same — **promote to `config.py`**. |
| `SARCASM_MITIGATION_ENABLED` / `SARCASM_*` (4 env vars in EmotionEngine) | Same — **promote to `config.py`**. Six env vars read directly via `os.getenv()` in `EmotionEngine` bypass the settings object. |
| `DIRECT_DEFAULT_MODEL` | **KEEP** |
| `OPENCLAW_MEMORY_DIR` | **DELETE**. Labeled "Legacy… retained for compatibility only." No code references it. |

---

## 8. Test Gaps + Exact Tests to Add

| Gap | What to test | File to create/extend |
|---|---|---|
| **Streaming SSE path** | `stream_room_chat_sse` produces correct SSE events for single and multi-agent rooms, handles provider errors mid-stream, deletes user message on zero successful replies | `test_room_chat_stream.py` |
| **DM stream wrapper** | `_dm_stream_wrapper` in `chat.py` correctly reshapes agent_done → legacy done, strips agent_id from content events | `test_dm_stream_wrapper.py` |
| **Compaction persona fallback** | When `_is_structured_summary_valid()` returns False, verify fallback fires and neutral summary is used | extend `test_compaction_v2.py` |
| **Dream scheduler `find_due_dreamers()`** | Test session_count, time, and event triggers. Test negative cooldown suppression. | `test_dream_scheduler.py` |
| **Memory auto-capture** | `maybe_autocapture_memory` saves facts matching regexes, respects daily limits, deduplicates | `test_memory_auto_capture.py` |
| **Emotion pre-LLM lock timeout** | When lock times out, verify graceful degradation (return None) vs. crash | extend `test_emotion_engine.py` |
| **First-turn context + system prompt double-time** | Assert time block appears exactly once when first_turn_context is injected alongside system prompt | `test_prompt_coherence.py` |
| **`orchestrate_agent_turn` (post-refactor)** | End-to-end: user message → emotion → context build → LLM → store → post-hooks | `test_orchestration.py` |
| **Dead config flags** | Assert `settings.llm_trigger_detection` and `settings.trigger_classifier_llm_fallback` are not referenced outside config.py | extend `test_config_realism_flags.py` |

---

## 9. "Do Not Touch" List

| Component | Why it's correct |
|---|---|
| **`EmotionEngine` core** (`services/emotion_engine.py`) — trigger deltas, decay math, mood projection, calibration learning | Well-tested (873-line test file), mathematically sound exponential decay, proper clamping. The Bayesian calibration with context buckets is the most sophisticated piece of the codebase and correctly implements long-term behavioral adaptation. |
| **`behavioral_rules.py`** | Clean trust-gated rule injection. Well-tested. The fragility profile system with breaking behaviors and behavioral unlocks is exactly the kind of mechanism that creates realistic negative dynamics. |
| **`soul_parser.py`** | Solid defensive parsing. Well-tested. Handles malformed SOUL.md gracefully. |
| **Provider abstraction** (`services/providers/`) | Clean interface. `NativeProvider` correctly wraps system prompt + tools. `OpenClawProvider` is a clear stub. `registry.py` dispatch is minimal and correct. |
| **Dream runtime** (`services/dreams/runtime.py`) | Correct prompt construction, proper safety bounds on deltas, negative cooldown mechanism, full audit trail logging. The only issue is the duplicated helpers (addressed in §4), not the core logic. |
| **Background task GC protection** (`services/background_tasks.py`) | Correct pattern for preventing asyncio task garbage collection. Small, correct, done. |
| **Memory search hybrid strategy** (`services/memory/search.py`) | Vector + FTS hybrid with configurable weights. Correct cosine similarity. Proper workspace sync before search. |
| **Trigger classifier sarcasm mitigation** in `EmotionEngine` | Legitimately addresses a real problem (classifier misreading sarcasm as positive). The dampening approach with recent context is more defensible than trying to detect sarcasm directly. |
| **`parse_chat.py`** | Clean regex extraction of behavior tags with `coalesce_response_text` safety net. Well-tested. |
