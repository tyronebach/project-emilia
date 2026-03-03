"""
Dream runtime: executes a dream reflection job for one agent/user pair.

A dream job:
  1. Assembles a reflection prompt from recent events + lived_experience
  2. Calls the agent's provider (generate, not stream)
  3. Parses the JSON response (bounded trust/attachment/intimacy deltas)
  4. Persists the new lived_experience snapshot
  5. Logs everything to dream_log

Phase A: stubs only.  Implementation in Phase D.
"""


async def execute_dream(user_id: str, agent_id: str, triggered_by: str = "scheduler") -> dict:
    """Run a dream reflection job for the given user/agent pair.

    Args:
        user_id:      User whose perspective the dream reflects on.
        agent_id:     Agent doing the reflecting.
        triggered_by: Source label for the audit log ('scheduler', 'manual', …).

    Returns:
        The inserted dream_log row dict.
    """
    raise NotImplementedError("dreams.runtime.execute_dream — Phase D")
