"""Room chat SSE streaming — the async generator for multi-agent streaming responses."""
import asyncio
import json
import logging
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
    build_room_llm_messages,
    extract_behavior_dict,
    inject_first_turn_context_if_present,
    inject_game_context_if_present,
    inject_top_of_mind_if_present,
    room_message_row,
)

logger = logging.getLogger(__name__)


def _message_behavior(message: dict) -> dict:
    return extract_behavior_dict(
        intent=message.get("behavior_intent"),
        mood=message.get("behavior_mood"),
        mood_intensity=message.get("behavior_mood_intensity"),
        energy=message.get("behavior_energy"),
        move=message.get("behavior_move"),
        game_action=message.get("behavior_game_action"),
    )


def serialize_room_message(message: dict):
    """Serialize a DB message row to a RoomMessageResponse."""
    from schemas import RoomMessageResponse

    payload = dict(message)
    payload["behavior"] = _message_behavior(payload)
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
    emotion_input_message = "" if runtime_trigger else message
    post_llm_user_message = None if runtime_trigger else message
    successful_replies = 0

    for agent in responding_agents:
        agent_id = agent["agent_id"]
        agent_config = AgentRepository.get_by_id(agent_id) or {}
        agent_workspace = agent_config.get("workspace")
        agent_name = agent.get("display_name") or agent_id
        started_at = time.time()

        yield f"event: agent_start\ndata: {json.dumps({'agent_id': agent_id, 'agent_name': agent_name})}\n\n"

        try:
            is_first_turn = (
                not runtime_trigger
                and RoomMessageRepository.get_agent_reply_count(room_id, agent_id) == 0
            )
            first_turn_context = (
                _build_first_turn_context(
                    user_id,
                    agent_id,
                    agent_workspace=agent_workspace if isinstance(agent_workspace, str) else None,
                )
                if is_first_turn
                else None
            )

            emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
                user_id,
                agent_id,
                emotion_input_message,
                f"room:{room_id}",
            )
            emotion_snapshot = _safe_get_mood_snapshot(user_id, agent_id)

            effective_game_context = game_context if settings.is_games_v2_enabled_for_agent(agent_id) else None
            llm_messages = build_room_llm_messages(
                room_id=room_id,
                agent=agent,
                all_room_agents=room_agents,
                history_limit=settings.chat_history_limit,
                emotional_context=emotional_context,
                include_game_runtime=bool(effective_game_context),
            )
            top_of_mind_context = await build_top_of_mind_context(
                query=message,
                agent_id=agent_id,
                user_id=user_id,
                workspace=agent_workspace if isinstance(agent_workspace, str) else None,
                runtime_trigger=runtime_trigger,
            )
            llm_messages = inject_top_of_mind_if_present(llm_messages, top_of_mind_context)
            llm_messages = inject_first_turn_context_if_present(llm_messages, first_turn_context)
            llm_messages = inject_game_context_if_present(llm_messages, agent_id, effective_game_context)

            log_metric(
                logger,
                "autorecall",
                room_id=room_id,
                agent_id=agent_id,
                user_id=user_id,
                hit_count=0 if not top_of_mind_context else top_of_mind_context.count("\n- [score"),
                injected_chars=len(top_of_mind_context or ""),
            )

            usage = None
            full_content = ""
            provider = get_provider(agent_config or agent)
            try:
                async for chunk in provider.stream(
                    llm_messages,
                    workspace=agent_workspace,
                    agent_id=agent_config.get("id") or agent_id,
                    user_id=user_id,
                    user_tag=f"emilia:room:{room_id}",
                    timeout_s=120.0,
                    timezone=settings.default_timezone,
                    include_behavior_format=True,
                ):
                    if isinstance(chunk, str):
                        chunk_content = chunk
                    elif isinstance(chunk, dict):
                        if chunk.get("type") == "usage":
                            usage = chunk.get("usage")
                            continue
                        if chunk.get("type") == "done":
                            if chunk.get("model"):
                                pass
                            break
                        chunk_content = str(chunk.get("content") or "") if chunk.get("type") == "content" else ""
                    else:
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
            except NotImplementedError as exc:
                payload = {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "error": str(exc),
                }
                yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
                continue
            except ValueError as exc:
                payload = {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "error": str(exc),
                }
                yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
                continue
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response else 503
                logger.exception("Room provider stream HTTP error for %s", agent_id)
                detail = ""
                if exc.response is not None:
                    try:
                        detail = (exc.response.text or "").strip()
                    except Exception:
                        detail = ""
                if detail:
                    detail = detail[:220]
                payload = {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "error": (
                        f"Chat service error ({status_code}): {detail}"
                        if detail
                        else f"Chat service error ({status_code})"
                    ),
                }
                yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
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

            _spawn_background(asyncio.to_thread(
                _process_emotion_post_llm,
                user_id,
                agent_id,
                behavior,
                f"room:{room_id}",
                pre_llm_triggers,
                post_llm_user_message,
            ))

            if isinstance(agent_workspace, str) and agent_workspace.strip() and post_llm_user_message:
                _spawn_background(maybe_autocapture_memory(
                    workspace=agent_workspace,
                    agent_id=agent_id,
                    user_id=user_id,
                    user_message=post_llm_user_message,
                    agent_response=clean_content,
                ))

            if isinstance(agent_workspace, str) and agent_workspace.strip():
                state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
                interaction_count = int(state_row.get("interaction_count") or 0)
                game_id_value = _ctx_value(effective_game_context, "game_id", "gameId")
                game_id = (
                    game_id_value.strip()
                    if isinstance(game_id_value, str) and game_id_value.strip()
                    else None
                )
                _spawn_background(asyncio.to_thread(
                    _ensure_workspace_milestones,
                    agent_workspace=agent_workspace,
                    user_id=user_id,
                    agent_id=agent_id,
                    interaction_count=interaction_count,
                    runtime_trigger=runtime_trigger,
                    game_id=game_id,
                ))

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
            }
            yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
        except Exception:
            logger.exception("Streaming room chat failure for %s", agent_id)
            payload = {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "error": "Room chat failed",
            }
            yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"

    if successful_replies == 0 and user_msg_id:
        RoomMessageRepository.delete_by_id(user_msg_id)
    elif successful_replies > 0:
        _spawn_background(maybe_compact_room(room_id))

    yield f"data: {json.dumps({'done': True, 'room_id': room_id})}\n\n"
