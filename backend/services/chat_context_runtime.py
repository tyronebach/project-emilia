"""Shared chat/room context helpers and workspace hooks."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from config import settings
from db.repositories import EmotionalStateRepository, GameRepository
from services.soul_window_service import get_mood_snapshot
from services.workspace_events import WorkspaceEventsService

logger = logging.getLogger(__name__)


def ctx_value(game_context, *keys):
    """Read a value from either dict-style or model-style game context."""
    if game_context is None:
        return None

    if isinstance(game_context, dict):
        for key in keys:
            if key in game_context:
                value = game_context.get(key)
                if value is not None:
                    return value
        return None

    for key in keys:
        if hasattr(game_context, key):
            value = getattr(game_context, key)
            if value is not None:
                return value
    return None


def resolve_trusted_prompt_instructions(agent_id: str, game_context) -> str:
    """Resolve per-game prompt instructions from server-side registry/config."""
    game_id = ctx_value(game_context, "game_id", "gameId")
    if not isinstance(game_id, str) or not game_id.strip():
        return ""

    effective = GameRepository.get_effective_game_for_agent(agent_id, game_id.strip())
    if not effective:
        return ""

    prompt = effective.get("prompt_override") or effective.get("prompt_instructions") or ""
    if not isinstance(prompt, str):
        return ""
    return prompt.strip()


def inject_game_context(
    message: str,
    game_context,
    prompt_instructions: str | None = None,
) -> str:
    """Append game context to the user's message for the LLM prompt."""
    if not game_context:
        return message

    game_id = ctx_value(game_context, "game_id", "gameId") or "unknown"
    if prompt_instructions is None:
        # Backward-compatible fallback for callsites/tests that don't inject trusted prompts.
        prompt_instructions = ctx_value(game_context, "prompt_instructions", "promptInstructions") or ""
    state = ctx_value(game_context, "state_text", "state") or ""
    last_move = ctx_value(game_context, "last_user_move", "lastUserMove") or ""
    avatar_move = ctx_value(game_context, "avatar_move", "avatarMove")
    valid_moves = ctx_value(game_context, "valid_moves", "validMoves") or []
    status = ctx_value(game_context, "status") or "in_progress"

    # Build context block: Layer 2 (prompt instructions) + Layer 3 (game state)
    context_block = f"\n\n---\n[game: {game_id}]\n"

    if prompt_instructions:
        context_block += f"\n{prompt_instructions}\n"

    context_block += f"\n{state}\n"

    if last_move:
        context_block += f"The user just played: {last_move}\n"

    if avatar_move:
        context_block += f"You played: {avatar_move}\nReact to this game state naturally.\n"
    elif valid_moves:
        moves_str = ", ".join(str(move) for move in valid_moves[:30])
        context_block += f"It's your turn. Legal moves: {moves_str}\n"
        context_block += "Choose a move and include it as [move:your_move] in your response.\n"

    if status == "game_over":
        context_block += "The game is over. React to the outcome.\n"

    context_block += "---"

    return message + context_block


def time_of_day_bucket(dt: datetime) -> str:
    hour = dt.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "night"


def _time_of_day_bucket(dt: datetime) -> str:
    """Backward-compatible alias."""
    return time_of_day_bucket(dt)


def build_first_turn_context(
    user_id: str,
    agent_id: str,
    *,
    agent_workspace: str | None,
) -> str | None:
    """Build deterministic first-turn facts block using configured timezone."""
    now_utc = datetime.now(timezone.utc)
    try:
        tz_info = ZoneInfo(settings.default_timezone)
        now_local = datetime.now(tz_info)
        tz_label = settings.default_timezone
    except Exception:
        now_local = now_utc
        tz_label = "UTC"

    lines = [
        f"Session facts ({tz_label}):",
        f"- now: {now_local.strftime('%Y-%m-%d %H:%M')}",
        f"- day: {now_local.strftime('%A')}",
        f"- time_of_day: {time_of_day_bucket(now_local)}",
    ]

    try:
        prior_state = EmotionalStateRepository.get(user_id, agent_id)
        last_interaction = prior_state.get("last_interaction") if prior_state else None
        if isinstance(last_interaction, (int, float)):
            days_since = max(0, int((now_utc.timestamp() - float(last_interaction)) // 86400))
            lines.append(f"- days_since_last_interaction: {days_since}")
    except Exception:
        logger.exception("Failed building first-turn interaction facts for %s/%s", user_id, agent_id)

    if agent_workspace:
        try:
            upcoming = WorkspaceEventsService.get_upcoming(
                Path(agent_workspace),
                user_id,
                agent_id,
                days=7,
                now_utc=now_utc,
            )
            if upcoming:
                lines.append("- upcoming_events_next_7_days:")
                for event in upcoming[:3]:
                    event_type = str(event.get("type") or "event")
                    event_date = str(event.get("date") or "")
                    event_note = str(event.get("note") or "").strip()
                    if event_note:
                        lines.append(f"  - {event_type} on {event_date}: {event_note}")
                    else:
                        lines.append(f"  - {event_type} on {event_date}")
        except Exception:
            logger.exception("Failed loading first-turn upcoming events for %s/%s", user_id, agent_id)

    if len(lines) <= 1:
        return None
    return "\n".join(lines)


def ensure_workspace_milestones(
    *,
    agent_workspace: str,
    user_id: str,
    agent_id: str,
    interaction_count: int,
    runtime_trigger: bool,
    game_id: str | None,
) -> None:
    """Best-effort auto milestone persistence to workspace events file."""
    try:
        WorkspaceEventsService.ensure_auto_milestones(
            Path(agent_workspace),
            user_id,
            agent_id,
            interaction_count=interaction_count,
            runtime_trigger=runtime_trigger,
            game_id=game_id,
        )
    except Exception:
        logger.exception("Failed writing auto milestones for %s/%s", user_id, agent_id)


def safe_get_mood_snapshot(user_id: str, agent_id: str) -> dict | None:
    """Best-effort mood snapshot for debug/UI payloads."""
    try:
        return get_mood_snapshot(user_id, agent_id)
    except Exception:
        logger.exception("Failed loading mood snapshot for %s/%s", user_id, agent_id)
        return None
