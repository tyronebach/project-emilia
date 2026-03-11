# Prompt Assembly

Backend prompt order as implemented today.

## Scope

- `POST /api/chat`
- `POST /api/rooms/{room_id}/chat`
- room SSE
- dream execution
- room compaction

## Room and DM Chat

DM chat is a facade over the room runtime, so prompt assembly is shared.

Base builders:
- `backend/services/room_chat.py::build_room_llm_messages`
- `backend/services/room_chat.py::PromptBuilder`
- `backend/services/providers/native.py::_prepare_messages`
- `backend/services/direct_llm.py::prepend_webapp_system_prompt`

Order:

1. Provider prepend at index `0`
   - `## Canon` from workspace SOUL.md
   - `## Lived Experience` from `character_lived_experience`
   - behavioral rules from trust + fragility profile
   - current time block
   - memory instructions
   - behavior format instructions when enabled
2. Room system context from `_build_room_system_context(...)`
3. Optional emotional context system block
4. Optional stored room summary from `rooms.summary`
5. History window from `room_messages`
   - current agent's prior replies become `assistant`
   - all other speakers are rewritten as `user` messages with `[Name]: ...`
6. Per-turn injections applied by `PromptBuilder.build()`
   - top-of-mind recollections inserted before the last user message
   - first-turn facts prepended onto the last user message
   - game context appended onto the last user message

## Shared Runtime Parity

The following stay aligned across DM non-stream, room non-stream, and room stream paths:

- responding agent selection
- prompt build order
- first-turn facts
- top-of-mind injection
- game context injection
- post-LLM hooks

The DM streaming facade still strips room-specific attribution from outbound SSE events after the shared runtime produces them.

## Dreams

Owned by `backend/services/dreams/runtime.py::execute_dream`.

Dream prompt blocks are assembled into a single system message in this order:

1. identity header
2. `## Canon`
3. `## Lived Experience`
4. recent interactions
5. prior room summaries when enabled
6. memory hits when enabled
7. current relationship state
8. reflection instructions
9. JSON output contract

## Compaction

Owned by `backend/services/compaction.py::CompactionService.summarize_messages`.

Modes:
- neutral summary prompt
- persona summary prompt when `COMPACTION_PERSONA_MODE` resolves to persona mode

Persona mode includes:
- canon excerpt from workspace
- fixed section headers
- texture and open-thread limits from config

If persona output fails structural validation, compaction falls back to the neutral prompt and emits a warning plus `compaction_persona_fallback` metric.
