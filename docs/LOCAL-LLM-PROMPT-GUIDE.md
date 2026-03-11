# Local LLM Prompt Guide

Backend notes for running the native provider against local OpenAI-compatible models.

This is an operator guide for the current prompt stack. It is not a future design spec.

## Prompt Geography

For native-provider calls, the message stack is assembled in this order:

1. Provider prepend from `backend/services/direct_llm.py`
   - `## Canon`
   - `## Lived Experience`
   - behavioral rules
   - current time
   - memory instructions
   - behavior format instructions
2. Room system context from `backend/services/room_chat.py`
3. Optional emotional context
4. Optional room summary
5. History window
6. Per-turn injections near the last user turn
   - top-of-mind recollections
   - first-turn facts
   - game context

For the authoritative code path, read:
- `backend/services/direct_llm.py`
- `backend/services/providers/native.py`
- `backend/services/room_chat.py`
- `docs/PROMPT_ASSEMBLY.md`

## Practical Tuning Targets

If a local model loses character:
- tighten `SOUL.md` canon text
- shorten noisy room summaries
- keep behavioral rules concrete
- keep top-of-mind snippets short and specific

If a local model ignores continuity:
- inspect top-of-mind hits from `backend/services/memory/top_of_mind.py`
- verify `MEMORY_AUTORECALL_ENABLED` and thresholds in `backend/config.py`
- confirm compaction is producing useful `rooms.summary` content

If a local model emits malformed behavior tags:
- inspect `BEHAVIOR_FORMAT_INSTRUCTIONS` in `backend/services/direct_llm.py`
- confirm the provider call used `include_behavior_format=True`

## Current Limits

- The backend does not have a separate local-model prompt profile.
- Native provider behavior still depends on the same shared prepend used for OpenAI-compatible cloud calls.
- Compaction still writes only the latest `rooms.summary`; older summaries are not queryable yet.

<!-- TODO: If P023 lands, update this guide to cover session-recall hits as another prompt input source. -->
