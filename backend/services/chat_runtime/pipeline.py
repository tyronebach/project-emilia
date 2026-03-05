"""Unified room chat execution pipeline."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

import httpx

from config import settings
from db.repositories import AgentRepository, EmotionalStateRepository, RoomMessageRepository
from parse_chat import parse_chat_completion
from services.background_tasks import spawn_background as _spawn_background
from services.chat_context_runtime import (
    build_first_turn_context as _build_first_turn_context,
    ctx_value as _ctx_value,
    ensure_workspace_milestones as _ensure_workspace_milestones,
    safe_get_mood_snapshot as _safe_get_mood_snapshot,
)
from services.chat_runtime.context import build_context
from services.emotion_runtime import (
    process_emotion_post_llm as _process_emotion_post_llm,
    process_emotion_pre_llm as _process_emotion_pre_llm,
)
from services.llm_caller import call_llm_non_stream
from services.memory.auto_capture import maybe_autocapture_memory
from services.memory.top_of_mind import build_top_of_mind_context
from services.observability import log_metric
from services.room_chat import (
    determine_responding_agents,
    prepare_agent_turn_context,
    room_message_row,
    schedule_post_llm_tasks,
)
from services.room_chat_stream import maybe_compact_room, serialize_room_message, stream_room_chat_sse

logger = logging.getLogger(__name__)


async def process_message(
    user_id: str,
    agent_id: str | None,
    room_id: str,
    message: str,
    *,
    stream: bool = False,
    mention_agents: list[str] | None = None,
    game_context: object | None = None,
    runtime_trigger: bool = False,
    # injectable hooks (router passes these so existing tests/patches still work)
    determine_responding_agents_fn: Callable[[str, list[str] | None, list[dict]], list[dict]] = determine_responding_agents,
    is_games_v2_enabled_for_agent_fn: Callable[[str], bool] = settings.is_games_v2_enabled_for_agent,
    prepare_agent_turn_context_fn=prepare_agent_turn_context,
    call_llm_non_stream_fn=call_llm_non_stream,
    parse_chat_completion_fn=parse_chat_completion,
    room_message_row_fn=room_message_row,
    schedule_post_llm_tasks_fn=schedule_post_llm_tasks,
    serialize_room_message_fn=serialize_room_message,
    stream_room_chat_sse_fn=stream_room_chat_sse,
    maybe_compact_room_fn=maybe_compact_room,
    process_emotion_pre_llm_fn=_process_emotion_pre_llm,
    process_emotion_post_llm_fn=_process_emotion_post_llm,
    build_first_turn_context_fn=_build_first_turn_context,
    build_top_of_mind_context_fn=build_top_of_mind_context,
    maybe_autocapture_memory_fn=maybe_autocapture_memory,
    ensure_workspace_milestones_fn=_ensure_workspace_milestones,
    emotional_state_get_or_create_fn=EmotionalStateRepository.get_or_create,
    ctx_value_fn=_ctx_value,
    spawn_background_fn=_spawn_background,
    to_thread_fn=asyncio.to_thread,
    log_metric_fn=log_metric,
    safe_get_mood_snapshot_fn=_safe_get_mood_snapshot,
    logger_obj: logging.Logger | None = None,
) -> Any:
    """Process room/DM message through one shared execution path."""
    _logger = logger_obj or logger

    context = await build_context(
        user_id=user_id,
        agent_id=agent_id,
        room_id=room_id,
        message=message,
        mention_agents=mention_agents,
        game_context=game_context,
        runtime_trigger=runtime_trigger,
        determine_responding_agents_fn=determine_responding_agents_fn,
        is_games_v2_enabled_for_agent_fn=is_games_v2_enabled_for_agent_fn,
        logger_obj=_logger,
    )

    user_msg = RoomMessageRepository.add(
        room_id=room_id,
        sender_type="user",
        sender_id=user_id,
        content=message,
        origin="game_runtime" if context.runtime_trigger else "chat",
    )
    user_msg_id = user_msg.get("id")

    if stream:
        return stream_room_chat_sse_fn(
            room_id=room_id,
            user_id=user_id,
            message=message,
            game_context=context.effective_game_context,
            runtime_trigger=context.runtime_trigger,
            room_agents=context.room_agents,
            responding_agents=context.responding_agents,
            user_msg_id=user_msg_id,
        )

    responses: list[dict] = []
    value_error_detail: str | None = None
    emotion_debug: dict[str, dict] = {}

    for agent in context.responding_agents:
        current_agent_id = str(agent.get("agent_id") or "")
        if not current_agent_id:
            continue

        agent_config = AgentRepository.get_by_id(current_agent_id) or {}
        agent_workspace = agent_config.get("workspace")
        started_at = time.time()

        try:
            prepared = await prepare_agent_turn_context_fn(
                room_id=room_id,
                user_id=user_id,
                agent=agent,
                room_agents=context.room_agents,
                user_message=message,
                runtime_trigger=context.runtime_trigger,
                game_context=context.effective_game_context,
                chat_history_limit=settings.chat_history_limit,
                agent_workspace_value=agent_workspace,
                build_first_turn_context_fn=build_first_turn_context_fn,
                process_emotion_pre_llm_fn=process_emotion_pre_llm_fn,
                build_top_of_mind_context_fn=build_top_of_mind_context_fn,
                is_games_v2_enabled_for_agent_fn=is_games_v2_enabled_for_agent_fn,
                log_metric_fn=log_metric_fn,
                logger_obj=_logger,
            )

            snapshot = safe_get_mood_snapshot_fn(user_id, current_agent_id)

            result = await call_llm_non_stream_fn(
                {**agent, "user_id": user_id},
                prepared.llm_messages,
                room_id,
            )
            parsed = parse_chat_completion_fn(result)
            processing_ms = int((time.time() - started_at) * 1000)

            behavior = parsed.get("behavior", {})
            usage = result.get("usage") or {}

            stored = RoomMessageRepository.add(
                room_id=room_id,
                sender_type="agent",
                sender_id=current_agent_id,
                content=parsed["response_text"],
                origin="chat",
                model=result.get("model"),
                processing_ms=processing_ms,
                usage_prompt_tokens=usage.get("prompt_tokens"),
                usage_completion_tokens=usage.get("completion_tokens"),
                behavior_intent=behavior.get("intent"),
                behavior_mood=behavior.get("mood"),
                behavior_mood_intensity=behavior.get("mood_intensity"),
                behavior_energy=behavior.get("energy"),
                behavior_move=behavior.get("move"),
                behavior_game_action=behavior.get("game_action"),
            )

            schedule_post_llm_tasks_fn(
                room_id=room_id,
                user_id=user_id,
                agent_id=current_agent_id,
                behavior=behavior,
                pre_llm_triggers=prepared.pre_llm_triggers,
                runtime_trigger=context.runtime_trigger,
                workspace=prepared.workspace,
                effective_game_context=prepared.effective_game_context,
                autocapture_user_message=message,
                agent_response=parsed["response_text"],
                process_emotion_post_llm_fn=process_emotion_post_llm_fn,
                maybe_autocapture_memory_fn=maybe_autocapture_memory_fn,
                ensure_workspace_milestones_fn=ensure_workspace_milestones_fn,
                emotional_state_get_or_create_fn=emotional_state_get_or_create_fn,
                ctx_value_fn=ctx_value_fn,
                spawn_background_fn=spawn_background_fn,
                to_thread_fn=to_thread_fn,
            )

            msg_row = {
                **room_message_row_fn(
                    room_id=room_id,
                    sender_type="agent",
                    sender_id=current_agent_id,
                    sender_name=agent.get("display_name") or current_agent_id,
                    content=parsed["response_text"],
                    origin="chat",
                    timestamp=stored["timestamp"],
                    model=result.get("model"),
                    processing_ms=processing_ms,
                    usage_prompt_tokens=usage.get("prompt_tokens"),
                    usage_completion_tokens=usage.get("completion_tokens"),
                    behavior=behavior,
                ),
                "id": stored["id"],
            }

            serialized = serialize_room_message_fn(msg_row)
            message_payload = serialized.model_dump() if hasattr(serialized, "model_dump") else msg_row

            responses.append(
                {
                    "agent_id": current_agent_id,
                    "agent_name": agent.get("display_name") or current_agent_id,
                    "message": message_payload,
                    "processing_ms": processing_ms,
                    "model": result.get("model"),
                    "usage": usage,
                }
            )

            if prepared.emotional_context or prepared.pre_llm_triggers or snapshot:
                emotion_debug[current_agent_id] = {
                    "triggers": [[t, round(i, 3)] for t, i in prepared.pre_llm_triggers],
                    "context_block": prepared.emotional_context,
                    "snapshot": snapshot,
                }

        except httpx.TimeoutException:
            _logger.exception("Room chat timeout for agent %s", current_agent_id)
        except ValueError as exc:
            _logger.exception("Room chat failure for agent %s", current_agent_id)
            if value_error_detail is None:
                value_error_detail = str(exc)
        except Exception:
            _logger.exception("Room chat failure for agent %s", current_agent_id)

    if not responses:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        if value_error_detail:
            raise ValueError(value_error_detail)
        raise RuntimeError("Room chat")

    spawn_background_fn(maybe_compact_room_fn(room_id))

    payload: dict[str, Any] = {
        "room_id": room_id,
        "responses": responses,
        "count": len(responses),
    }
    if emotion_debug:
        payload["emotion_debug"] = emotion_debug

    return payload
