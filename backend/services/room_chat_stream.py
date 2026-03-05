"""Room chat SSE streaming — the async generator for multi-agent streaming responses."""
import asyncio
from dataclasses import dataclass
import json
import logging
import random
import time
import httpx

from config import settings
from db.repositories import (
    AgentRepository,
    EmotionalStateRepository,
    RoomMessageRepository,
    RoomRepository,
)
from parse_chat import extract_avatar_commands, coalesce_response_text
from services.background_tasks import spawn_background as _spawn_background
from services.chat_context_runtime import (
    build_first_turn_context as _build_first_turn_context,
    ctx_value as _ctx_value,
    ensure_workspace_milestones as _ensure_workspace_milestones,
    safe_get_mood_snapshot as _safe_get_mood_snapshot,
)
from services.emotion_runtime import (
    process_emotion_post_llm as _process_emotion_post_llm,
    process_emotion_pre_llm as _process_emotion_pre_llm,
)
from services.llm_caller import MAX_RESPONSE_CHARS
from services.memory.auto_capture import maybe_autocapture_memory
from services.memory.top_of_mind import build_top_of_mind_context
from services.observability import log_metric
from services.providers.registry import get_provider
from services.room_chat import (
    extract_behavior_dict,
    prepare_agent_turn_context,
    room_message_row,
    schedule_post_llm_tasks,
)

logger = logging.getLogger(__name__)

_STREAM_RETRY_MAX_RETRIES = 1
_STREAM_RETRY_BASE_DELAY_S = 0.25
_STREAM_RETRY_JITTER_S = 0.15


@dataclass(frozen=True)
class ProviderErrorPayload:
    error: str
    error_code: str
    retryable: bool
    status_code: int | None


def _is_retryable_status_code(status_code: int | None) -> bool:
    if status_code is None:
        return False
    return status_code == 429 or status_code >= 500


def _retry_backoff_delay(attempt: int) -> float:
    return (_STREAM_RETRY_BASE_DELAY_S * max(attempt, 1)) + random.uniform(0.0, _STREAM_RETRY_JITTER_S)


def _normalize_provider_error(exc: Exception) -> ProviderErrorPayload:
    if isinstance(exc, httpx.TimeoutException):
        return ProviderErrorPayload(
            error="Room chat timeout",
            error_code="provider_timeout",
            retryable=True,
            status_code=None,
        )

    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else 503
        detail = ""
        if exc.response is not None:
            try:
                detail = (exc.response.text or "").strip()
            except Exception:
                detail = ""
        if detail:
            detail = detail[:220]

        if status_code == 429:
            error_code = "provider_rate_limited"
        elif status_code >= 500:
            error_code = "provider_http_server_error"
        else:
            error_code = "provider_http_client_error"

        error = f"Chat service error ({status_code})"
        if detail:
            error = f"{error}: {detail}"

        return ProviderErrorPayload(
            error=error,
            error_code=error_code,
            retryable=_is_retryable_status_code(status_code),
            status_code=status_code,
        )

    if isinstance(exc, NotImplementedError):
        return ProviderErrorPayload(
            error=str(exc),
            error_code="provider_not_implemented",
            retryable=False,
            status_code=None,
        )

    if isinstance(exc, ValueError):
        return ProviderErrorPayload(
            error=str(exc),
            error_code="provider_invalid_request",
            retryable=False,
            status_code=None,
        )

    return ProviderErrorPayload(
        error="Room chat failed",
        error_code="provider_stream_failed",
        retryable=False,
        status_code=None,
    )


def serialize_room_message(message: dict):
    """Serialize a DB message row to a RoomMessageResponse."""
    from schemas import RoomMessageResponse

    payload = dict(message)
    payload["behavior"] = extract_behavior_dict(
        intent=payload.get("behavior_intent"),
        mood=payload.get("behavior_mood"),
        mood_intensity=payload.get("behavior_mood_intensity"),
        energy=payload.get("behavior_energy"),
        move=payload.get("behavior_move"),
        game_action=payload.get("behavior_game_action"),
    )
    return RoomMessageResponse(**payload)


async def maybe_compact_room(room_id: str) -> dict | None:
    room = RoomRepository.get_by_id(room_id)
    if not room:
        return None

    room_settings = room.get("settings") if isinstance(room.get("settings"), dict) else {}
    if isinstance(room_settings, dict) and room_settings.get("compact_enabled") is False:
        return None

    msg_count = RoomRepository.get_message_count(room_id)
    if msg_count <= settings.compact_threshold:
        return None

    logger.info(
        "Room %s has %d messages (threshold=%d), compacting",
        room_id,
        msg_count,
        settings.compact_threshold,
    )

    try:
        from services.compaction import CompactionService

        all_msgs = RoomMessageRepository.get_all_for_room(room_id)
        split_at = len(all_msgs) - settings.compact_keep_recent
        if split_at <= 0:
            return None

        old_msgs = all_msgs[:split_at]
        existing_summary = RoomRepository.get_summary(room_id)

        to_summarize: list[dict] = []
        if existing_summary:
            to_summarize.append({"role": "system", "content": f"Prior summary: {existing_summary}"})

        for msg in old_msgs:
            sender_name = str(msg.get("sender_name") or msg.get("sender_id") or "Unknown")
            content = str(msg.get("content") or "")
            to_summarize.append({"role": "user", "content": f"[{sender_name}]: {content}"})

        room_type = str(room.get("room_type") or "group")
        agent_name = None
        agent_workspace = None
        if room_type == "dm":
            dm_agents = RoomRepository.get_agents(room_id)
            if dm_agents:
                dm_agent_id = str(dm_agents[0].get("agent_id") or "")
                agent_name = str(dm_agents[0].get("display_name") or dm_agent_id)
                dm_agent_config = AgentRepository.get_by_id(dm_agent_id) or {}
                workspace_value = dm_agent_config.get("workspace")
                agent_workspace = workspace_value if isinstance(workspace_value, str) else None

        summary = await CompactionService.summarize_messages(
            to_summarize,
            room_type=room_type,
            agent_name=agent_name,
            agent_workspace=agent_workspace,
        )

        summary_style = "neutral"
        if settings.compaction_persona_mode == "all":
            summary_style = "persona_dm" if room_type == "dm" else "persona"
        elif settings.compaction_persona_mode == "dm_only" and room_type == "dm":
            summary_style = "persona_dm"

        RoomRepository.update_summary(
            room_id,
            summary,
            summary_style=summary_style,
            summary_version=2,
        )
        deleted = RoomMessageRepository.delete_oldest(room_id, settings.compact_keep_recent)

        logger.info(
            "[RoomCompaction] Room %s: deleted %d msgs, kept %d, summary %d chars",
            room_id,
            deleted,
            settings.compact_keep_recent,
            len(summary),
        )
        return {
            "compacted": True,
            "messages_before": msg_count,
            "messages_deleted": deleted,
            "messages_kept": settings.compact_keep_recent,
            "summary_chars": len(summary),
        }
    except Exception:
        logger.exception("Compaction failed for room %s, continuing with full history", room_id)
        return {"compacted": False, "error": "Compaction failed"}


async def stream_room_chat_sse(
    room_id: str,
    user_id: str,
    message: str,
    game_context: object | None,
    runtime_trigger: bool,
    room_agents: list[dict],
    responding_agents: list[dict],
    user_msg_id: str | None = None,
):
    """Async generator yielding SSE event lines for multi-agent room chat."""
    post_llm_user_message = None if runtime_trigger else message
    successful_replies = 0

    for agent in responding_agents:
        agent_id = agent["agent_id"]
        agent_config = AgentRepository.get_by_id(agent_id) or {}
        agent_name = agent.get("display_name") or agent_id
        started_at = time.time()

        yield f"event: agent_start\ndata: {json.dumps({'agent_id': agent_id, 'agent_name': agent_name})}\n\n"

        try:
            prepared = await prepare_agent_turn_context(
                room_id=room_id,
                user_id=user_id,
                agent=agent,
                room_agents=room_agents,
                user_message=message,
                runtime_trigger=runtime_trigger,
                game_context=game_context,
                chat_history_limit=settings.chat_history_limit,
                agent_workspace_value=agent_config.get("workspace"),
                build_first_turn_context_fn=_build_first_turn_context,
                process_emotion_pre_llm_fn=_process_emotion_pre_llm,
                build_top_of_mind_context_fn=build_top_of_mind_context,
                is_games_v2_enabled_for_agent_fn=settings.is_games_v2_enabled_for_agent,
                log_metric_fn=log_metric,
                logger_obj=logger,
            )

            emotional_context = prepared.emotional_context
            pre_llm_triggers = prepared.pre_llm_triggers
            emotion_snapshot = _safe_get_mood_snapshot(user_id, agent_id)

            provider = get_provider(agent_config or agent)
            usage = None
            full_content = ""
            attempts = 0
            provider_agent_id = agent_config.get("id") or agent_id
            stream_failed = False

            while True:
                attempts += 1
                try:
                    async for chunk in provider.stream(
                        prepared.llm_messages,
                        workspace=prepared.workspace,
                        agent_id=provider_agent_id,
                        user_id=user_id,
                        user_tag=f"emilia:room:{room_id}",
                        timeout_s=120.0,
                        timezone=settings.default_timezone,
                        include_behavior_format=True,
                    ):
                        if isinstance(chunk, str):
                            chunk_content = chunk
                        elif isinstance(chunk, dict):
                            chunk_type = str(chunk.get("type") or "")
                            if chunk_type == "usage":
                                usage = chunk.get("usage")
                                continue
                            if chunk_type == "done":
                                break
                            if chunk_type == "content":
                                chunk_content = str(chunk.get("content") or "")
                            else:
                                logger.debug(
                                    "Ignoring unknown provider stream chunk type for %s: %s",
                                    agent_id,
                                    chunk_type or type(chunk).__name__,
                                )
                                continue
                        else:
                            logger.debug(
                                "Ignoring unknown provider stream chunk payload for %s: %s",
                                agent_id,
                                type(chunk).__name__,
                            )
                            continue

                        if not chunk_content:
                            continue

                        allowed = MAX_RESPONSE_CHARS - len(full_content)
                        if allowed <= 0:
                            logger.warning(
                                "[Room SSE] Response for %s exceeded %d chars, truncating",
                                agent_id,
                                MAX_RESPONSE_CHARS,
                            )
                            break

                        chunk_to_send = chunk_content[:allowed]
                        full_content += chunk_to_send
                        if chunk_to_send:
                            yield f"data: {json.dumps({'content': chunk_to_send, 'agent_id': agent_id})}\n\n"

                        if len(chunk_content) > len(chunk_to_send):
                            logger.warning(
                                "[Room SSE] Response for %s exceeded %d chars, truncating",
                                agent_id,
                                MAX_RESPONSE_CHARS,
                            )
                            break
                    break
                except (httpx.TimeoutException, httpx.HTTPStatusError, NotImplementedError, ValueError) as exc:
                    normalized = _normalize_provider_error(exc)
                    should_retry = (
                        attempts <= _STREAM_RETRY_MAX_RETRIES
                        and normalized.retryable
                        and not full_content
                    )
                    if should_retry:
                        delay_s = _retry_backoff_delay(attempts)
                        logger.warning(
                            "[Room SSE] Transient stream failure for %s (%s). Retrying in %.2fs.",
                            agent_id,
                            normalized.error_code,
                            delay_s,
                        )
                        await asyncio.sleep(delay_s)
                        continue

                    if isinstance(exc, httpx.HTTPStatusError):
                        logger.exception("Room provider stream HTTP error for %s", agent_id)
                    elif isinstance(exc, httpx.TimeoutException):
                        logger.warning("Room provider stream timeout for %s", agent_id)
                    else:
                        logger.exception("Room provider stream error for %s", agent_id)

                    payload = {
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "error": normalized.error,
                        "error_code": normalized.error_code,
                        "retryable": normalized.retryable,
                        "status_code": normalized.status_code,
                    }
                    yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
                    stream_failed = True
                    break

            if stream_failed:
                continue

            clean_content, behavior = extract_avatar_commands(full_content)
            clean_content = coalesce_response_text(clean_content, full_content)
            processing_ms = int((time.time() - started_at) * 1000)
            usage_data = usage or {}

            stored = RoomMessageRepository.add(
                room_id=room_id,
                sender_type="agent",
                sender_id=agent_id,
                content=clean_content,
                origin="chat",
                model=None,
                processing_ms=processing_ms,
                usage_prompt_tokens=usage_data.get("prompt_tokens"),
                usage_completion_tokens=usage_data.get("completion_tokens"),
                behavior_intent=behavior.get("intent"),
                behavior_mood=behavior.get("mood"),
                behavior_mood_intensity=behavior.get("mood_intensity"),
                behavior_energy=behavior.get("energy"),
                behavior_move=behavior.get("move"),
                behavior_game_action=behavior.get("game_action"),
            )

            schedule_post_llm_tasks(
                room_id=room_id,
                user_id=user_id,
                agent_id=agent_id,
                behavior=behavior,
                pre_llm_triggers=pre_llm_triggers,
                runtime_trigger=runtime_trigger,
                workspace=prepared.workspace,
                effective_game_context=prepared.effective_game_context,
                autocapture_user_message=post_llm_user_message,
                agent_response=clean_content,
                process_emotion_post_llm_fn=_process_emotion_post_llm,
                maybe_autocapture_memory_fn=maybe_autocapture_memory,
                ensure_workspace_milestones_fn=_ensure_workspace_milestones,
                emotional_state_get_or_create_fn=EmotionalStateRepository.get_or_create,
                ctx_value_fn=_ctx_value,
                spawn_background_fn=_spawn_background,
                to_thread_fn=asyncio.to_thread,
            )

            done_message = {
                **room_message_row(
                    room_id=room_id,
                    sender_type="agent",
                    sender_id=agent_id,
                    sender_name=agent_name,
                    content=clean_content,
                    origin="chat",
                    timestamp=stored["timestamp"],
                    model=None,
                    processing_ms=processing_ms,
                    usage_prompt_tokens=usage_data.get("prompt_tokens"),
                    usage_completion_tokens=usage_data.get("completion_tokens"),
                    behavior=behavior,
                ),
                "id": stored["id"],
            }

            payload = {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "processing_ms": processing_ms,
                "usage": usage_data,
                "behavior": behavior,
                "message": serialize_room_message(done_message).model_dump(),
            }
            successful_replies += 1
            yield f"event: agent_done\ndata: {json.dumps(payload)}\n\n"

            avatar_payload = {
                "agent_id": agent_id,
                "agent_name": agent_name,
            }
            if behavior.get("intent"):
                avatar_payload["intent"] = behavior["intent"]
            if behavior.get("mood"):
                avatar_payload["mood"] = behavior["mood"]
                avatar_payload["intensity"] = behavior.get("mood_intensity")
            if behavior.get("energy"):
                avatar_payload["energy"] = behavior["energy"]
            if behavior.get("move"):
                avatar_payload["move"] = behavior["move"]
            if behavior.get("game_action"):
                avatar_payload["game_action"] = behavior["game_action"]
            if len(avatar_payload) > 2:
                yield f"event: avatar\ndata: {json.dumps(avatar_payload)}\n\n"

            if emotional_context or pre_llm_triggers or emotion_snapshot:
                emotion_payload = {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "triggers": [[t, round(i, 3)] for t, i in pre_llm_triggers],
                    "context_block": emotional_context,
                    "snapshot": emotion_snapshot,
                }
                yield f"event: emotion\ndata: {json.dumps(emotion_payload)}\n\n"

        except httpx.TimeoutException:
            payload = {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "error": "Room chat timeout",
                "error_code": "provider_timeout",
                "retryable": True,
                "status_code": None,
            }
            yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
        except Exception:
            logger.exception("Streaming room chat failure for %s", agent_id)
            payload = {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "error": "Room chat failed",
                "error_code": "room_chat_failed",
                "retryable": False,
                "status_code": None,
            }
            yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"

    if successful_replies == 0 and user_msg_id:
        RoomMessageRepository.delete_by_id(user_msg_id)
    elif successful_replies > 0:
        _spawn_background(maybe_compact_room(room_id))

    yield f"data: {json.dumps({'done': True, 'room_id': room_id})}\n\n"
