"""Context builder for the unified room chat pipeline."""
from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Callable

from config import settings
from db.repositories import RoomRepository
from services.room_chat import determine_responding_agents


@dataclass(frozen=True)
class ChatRuntimeContext:
    room_agents: list[dict]
    responding_agents: list[dict]
    runtime_trigger: bool
    effective_game_context: object | None


async def build_context(
    user_id: str,
    agent_id: str | None,
    room_id: str,
    *,
    message: str,
    mention_agents: list[str] | None,
    game_context: object | None,
    runtime_trigger: bool,
    determine_responding_agents_fn: Callable[[str, list[str] | None, list[dict]], list[dict]] = determine_responding_agents,
    is_games_v2_enabled_for_agent_fn: Callable[[str], bool] = settings.is_games_v2_enabled_for_agent,
    logger_obj: logging.Logger | None = None,
) -> ChatRuntimeContext:
    """Resolve room agent routing + runtime payload gating."""
    _logger = logger_obj or logging.getLogger(__name__)

    room_agents = RoomRepository.get_agents(room_id)
    if not room_agents:
        raise ValueError("Room has no agents")

    responding_agents = determine_responding_agents_fn(
        user_message=message,
        mention_agents=mention_agents,
        room_agents=room_agents,
    )
    if not responding_agents:
        raise ValueError("No agents selected to respond")

    # DM guard: if caller provided explicit agent_id, force only that agent.
    if agent_id:
        responding_agents = [a for a in responding_agents if a.get("agent_id") == agent_id]
        if not responding_agents:
            raise ValueError("No agents selected to respond")

    selected_games_v2_agents = [
        agent for agent in responding_agents
        if is_games_v2_enabled_for_agent_fn(str(agent.get("agent_id") or ""))
    ]
    games_v2_enabled_for_request = bool(selected_games_v2_agents)
    effective_runtime_trigger = bool(runtime_trigger) if games_v2_enabled_for_request else False

    if not games_v2_enabled_for_request and (runtime_trigger or game_context):
        _logger.info(
            "[ChatRuntime] Ignoring game payload because Games V2 rollout is disabled for room %s",
            room_id,
        )

    return ChatRuntimeContext(
        room_agents=room_agents,
        responding_agents=responding_agents,
        runtime_trigger=effective_runtime_trigger,
        effective_game_context=game_context if games_v2_enabled_for_request else None,
    )
