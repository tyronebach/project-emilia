"""
Context builder for the unified chat pipeline.

Assembles all context sources needed before calling the provider:
  - Agent persona (from DB, file, or hybrid — based on persona_source)
  - Recent conversation history (from room_messages)
  - Relevant memory chunks (via memory.search)
  - Current emotional weather (valence/arousal/mood)
  - Lived experience snapshot

Phase A: stub only.  Implementation in Phase B.
"""


async def build_context(
    user_id: str,
    agent_id: str,
    room_id: str,
) -> dict:
    """Assemble the full context dict for a chat turn.

    Args:
        user_id:  User whose perspective the context is assembled for.
        agent_id: Agent that will respond.
        room_id:  Room the conversation is taking place in.

    Returns:
        dict with keys: persona, history, memory_chunks, weather,
        lived_experience, and any other runtime metadata needed by the pipeline.
    """
    raise NotImplementedError("chat_runtime.context.build_context — Phase B")
