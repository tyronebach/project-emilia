"""LLM calling service — shared by streaming and non-streaming room chat paths."""
import logging

from config import settings
from db.repositories import AgentRepository
from services.providers.registry import get_provider

logger = logging.getLogger(__name__)

MAX_RESPONSE_CHARS = 50_000


async def call_llm_non_stream(agent: dict, messages: list[dict], room_id: str) -> dict:
    """Call the LLM via the resolved provider and return the full response dict."""
    agent_id = str(agent.get("agent_id") or "")
    agent_config = AgentRepository.get_by_id(agent_id) if agent_id else None
    resolved_agent = agent_config or agent
    provider = get_provider(resolved_agent)

    try:
        return await provider.generate(
            messages,
            workspace=(agent_config or {}).get("workspace"),
            agent_id=(agent_config or {}).get("id") or agent_id,
            user_id=agent.get("user_id"),
            user_tag=f"emilia:room:{room_id}",
            timeout_s=60.0,
            timezone=settings.default_timezone,
            include_behavior_format=True,
        )
    except NotImplementedError as exc:
        logger.warning("Provider not implemented for agent %s: %s", agent_id, exc)
        raise ValueError(str(exc)) from exc
