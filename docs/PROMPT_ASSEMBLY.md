# Prompt Assembly

This document is the canonical map of backend prompt block order and ownership.

## Scope

- DM chat (`POST /api/chat`)
- Room chat (`POST /api/rooms/{room_id}/chat`)
- Room chat SSE (`stream=1`)
- Dreams runtime
- Compaction summaries

## Room/DM Chat Prompt Order

Ownership:
- Base room/history context: `backend/services/room_chat.py::build_room_llm_messages`
- Per-turn injections: `backend/services/room_chat.py::prepare_agent_turn_context`
- Global webapp system prepend: `backend/services/providers/native.py::_prepare_messages`
  via `backend/services/direct_llm.py::prepend_webapp_system_prompt`

### 1. Base room/history build

`build_room_llm_messages(...)` creates the initial list:
1. System: room context (`_build_room_system_context`)
2. System (optional): emotional context from pre-LLM emotion runtime
3. System (optional): stored room summary
4. History messages:
   - current agent prior replies as `assistant`
   - all other speakers as `user` (`[Name]: content`)

### 2. Per-turn runtime injection

`prepare_agent_turn_context(...)` mutates the list in this order:
1. `inject_top_of_mind_if_present`:
   inserts autorecall memory as a `system` block before the last `user` message
2. `inject_first_turn_context_if_present`:
   prepends first-turn session facts to the last `user` message
3. `inject_game_context_if_present`:
   appends trusted game context to the last `user` message

### 3. Provider-level prepend (final step before model call)

`NativeProvider._prepare_messages(...)` prepends one global system message:
1. `## Canon` (workspace SOUL/canon)
2. `## Lived Experience`
3. Behavioral rules block (trust/fragility aware)
4. Webapp instructions:
   - current time block
   - memory tool usage rules
   - behavior tag format (when enabled)

This prepended message is inserted at index `0`, ahead of all room/system/history content.

### 4. Parity note

Non-stream DM, non-stream room, and SSE room paths all use:
- `prepare_agent_turn_context(...)` for pre-LLM assembly
- `schedule_post_llm_tasks(...)` for post-LLM hooks

This keeps context + hook behavior aligned across transports.

## Dreams Prompt Order

Ownership:
- `backend/services/dreams/runtime.py::execute_dream`

Dream prompt blocks (single system message, in order):
1. identity header (`You are {display_name}`)
2. `## Canon`
3. `## Lived Experience`
4. `## Recent Interactions`
5. `## Prior Room Summaries`
6. `## Memory Recollections`
7. `## Current Relationship State`
8. reflection instructions
9. strict JSON output contract

## Compaction Prompt Order

Ownership:
- `backend/services/compaction.py::CompactionService.summarize_messages`

Compaction messages:
1. System prompt:
   - neutral summarize prompt, or
   - persona compaction prompt (with canon excerpt) when enabled
2. conversation messages to summarize

If persona output fails structure validation, compaction falls back to neutral prompt and emits warning + metric.
