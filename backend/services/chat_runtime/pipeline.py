"""
Unified chat pipeline for Emilia standalone core.

Both DM chat (routers/chat.py) and room chat (routers/rooms.py) will call
process_message() so there is a single execution path for all chat traffic.

Pipeline steps (Phase B+):
  1. Load room + participants
  2. build_context() — persona + memory + weather + lived experience
  3. Invoke provider adapter (stream or non-stream)
  4. Parse behavior tags from response
  5. Persist message / events
  6. Trigger post-hooks (emotion updates, dream counters)

Phase A: stub only.  Implementation in Phase B.
"""


async def process_message(
    user_id: str,
    agent_id: str,
    room_id: str,
    message: str,
    *,
    stream: bool = False,
    **kwargs,
):
    """Process one user message through the full chat pipeline.

    Args:
        user_id:  Authenticated user sending the message.
        agent_id: Target agent.
        room_id:  Room the message belongs to.
        message:  Raw user message text.
        stream:   If True, yield text chunks; otherwise return a complete dict.
        **kwargs: Additional options (game_context, runtime_trigger, etc.).

    Returns:
        dict with response content and metadata (non-stream mode), or an
        async generator of str chunks (stream mode).
    """
    raise NotImplementedError("chat_runtime.pipeline.process_message — Phase B")
