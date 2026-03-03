"""
Dream scheduler: determines which agent/user pairs are due for a dream run.

Trigger conditions (any one suffices):
  - interaction_count threshold (e.g. every 5 new interactions)
  - time threshold (e.g. 48 h since last dream)
  - event trigger (e.g. large trust drop)

Phase A: stubs only.  Implementation in Phase D.
"""


def find_due_dreamers(user_id: str | None = None, agent_id: str | None = None) -> list[dict]:
    """Return a list of (user_id, agent_id) pairs that are due for a dream.

    Args:
        user_id:  If provided, restrict search to this user.
        agent_id: If provided, restrict search to this agent.

    Returns:
        List of dicts with keys {'user_id', 'agent_id', 'trigger_reason'}.
    """
    raise NotImplementedError("dreams.scheduler.find_due_dreamers — Phase D")
