"""Room routes: group chat CRUD + multi-agent messaging."""
import asyncio
import json
import logging
import time
import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from config import settings
from core.exceptions import (
    bad_request,
    forbidden,
    not_found,
    service_unavailable,
    timeout_error,
)
from db.repositories import (
    AgentRepository,
    EmotionalStateRepository,
    RoomMessageRepository,
    RoomRepository,
    UserRepository,
)
from dependencies import get_user_id, verify_token
from parse_chat import extract_avatar_commands, parse_chat_completion, coalesce_response_text
from routers.chat import (
    _build_first_turn_context,
    _ctx_value,
    _ensure_workspace_milestones,
    _process_emotion_post_llm,
    _process_emotion_pre_llm,
    _resolve_trusted_prompt_instructions,
    _safe_get_mood_snapshot,
    _spawn_background,
    inject_game_context,
)
from schemas import (
    AddRoomAgentRequest,
    CreateRoomRequest,
    DeleteResponse,
    RoomAgentListResponse,
    RoomAgentResponse,
    RoomChatAgentResponse,
    RoomChatRequest,
    RoomChatResponse,
    RoomDetailResponse,
    RoomHistoryResponse,
    RoomMessageResponse,
    RoomParticipantResponse,
    RoomResponse,
    RoomsListResponse,
    UpdateRoomAgentRequest,
    UpdateRoomRequest,
)
from services.room_chat import build_room_llm_messages, determine_responding_agents
from services.direct_llm import (
    DirectLLMClient,
    normalize_chat_mode,
    normalize_messages_for_direct,
    prepend_webapp_system_prompt,
    resolve_direct_api_base,
    resolve_direct_model,
)
from services.direct_tool_runtime import run_tool_loop

logger = logging.getLogger(__name__)
MAX_RESPONSE_CHARS = 50_000

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _ensure_user_exists(user_id: str) -> None:
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")


def _ensure_room_access(user_id: str, room_id: str) -> dict:
    room = RoomRepository.get_by_id(room_id)
    if not room:
        raise not_found("Room")
    if not RoomRepository.user_can_access(user_id, room_id):
        raise forbidden("Cannot access this room")
    return room


def _serialize_room(room: dict) -> RoomResponse:
    return RoomResponse(**room)


def _serialize_room_agent(agent: dict) -> RoomAgentResponse:
    return RoomAgentResponse(**agent)


def _serialize_participant(participant: dict) -> RoomParticipantResponse:
    return RoomParticipantResponse(**participant)


def _extract_behavior_dict(
    *,
    intent: str | None = None,
    mood: str | None = None,
    mood_intensity: float | None = None,
    energy: str | None = None,
    move: str | None = None,
    game_action: str | None = None,
) -> dict:
    return {
        "intent": intent,
        "mood": mood,
        "mood_intensity": mood_intensity if mood_intensity is not None else 1.0,
        "energy": energy,
        "move": move,
        "game_action": game_action,
    }


def _message_behavior(message: dict) -> dict:
    return _extract_behavior_dict(
        intent=message.get("behavior_intent"),
        mood=message.get("behavior_mood"),
        mood_intensity=message.get("behavior_mood_intensity"),
        energy=message.get("behavior_energy"),
        move=message.get("behavior_move"),
        game_action=message.get("behavior_game_action"),
    )


def _serialize_room_message(message: dict) -> RoomMessageResponse:
    payload = dict(message)
    payload["behavior"] = _message_behavior(payload)
    return RoomMessageResponse(**payload)


def _inject_game_context_if_present(
    messages: list[dict],
    agent_id: str,
    game_context: object | None,
) -> list[dict]:
    if not game_context:
        return messages

    trusted_prompt = _resolve_trusted_prompt_instructions(agent_id, game_context)

    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") != "user":
            continue
        messages[idx] = {
            **messages[idx],
            "content": inject_game_context(
                messages[idx].get("content") or "",
                game_context,
                prompt_instructions=trusted_prompt,
            ),
        }
        break

    return messages


def _inject_first_turn_context_if_present(
    messages: list[dict],
    first_turn_context: str | None,
) -> list[dict]:
    if not first_turn_context:
        return messages

    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") != "user":
            continue
        existing_content = str(messages[idx].get("content") or "")
        messages[idx] = {
            **messages[idx],
            "content": first_turn_context + "\n\n" + existing_content,
        }
        break

    return messages



async def _call_llm_non_stream(agent: dict, messages: list[dict], room_id: str) -> dict:
    agent_id = str(agent.get("agent_id") or "")
    agent_config = AgentRepository.get_by_id(agent_id) if agent_id else None
    chat_mode = normalize_chat_mode((agent_config or {}).get("chat_mode"))

    if chat_mode == "direct":
        direct_client = DirectLLMClient(
            api_base=resolve_direct_api_base(agent_config),
        )
        workspace = (agent_config or {}).get("workspace")
        direct_messages = prepend_webapp_system_prompt(
            normalize_messages_for_direct(messages),
            workspace,
            timezone=settings.default_timezone,
        )
        claw_id = (agent_config or {}).get("clawdbot_agent_id") or ""
        return await run_tool_loop(
            client=direct_client,
            model=resolve_direct_model(agent_config),
            messages=direct_messages,
            workspace=workspace,
            claw_agent_id=claw_id,
            user_tag=f"emilia:room:{room_id}",
            timeout_s=60.0,
        )

    # OpenClaw mode: inject only webapp-specific behavior format (for avatar animation)
    from services.direct_llm import build_webapp_system_instructions
    webapp_instructions = build_webapp_system_instructions(
        chat_mode="openclaw",
        include_behavior_format=True,
    )
    openclaw_messages = [
        {"role": "system", "content": webapp_instructions},
        *messages,
    ]

    clawdbot_agent_id = (agent.get("clawdbot_agent_id") or "").strip()
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.clawdbot_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.clawdbot_token}",
                "Content-Type": "application/json",
            },
            json={
                "model": f"agent:{clawdbot_agent_id}",
                "messages": openclaw_messages,
                "stream": False,
                "user": f"emilia:room:{room_id}",
            },
        )

    if response.status_code != 200:
        raise service_unavailable("Room chat")
    return response.json()


def _room_message_row(
    room_id: str,
    sender_type: str,
    sender_id: str,
    sender_name: str,
    content: str,
    origin: str,
    timestamp: float,
    model: str | None,
    processing_ms: int | None,
    usage_prompt_tokens: int | None,
    usage_completion_tokens: int | None,
    behavior: dict | None,
) -> dict:
    behavior = behavior or {}
    behavior_values = _extract_behavior_dict(
        intent=behavior.get("intent"),
        mood=behavior.get("mood"),
        mood_intensity=behavior.get("mood_intensity"),
        energy=behavior.get("energy"),
        move=behavior.get("move"),
        game_action=behavior.get("game_action"),
    )
    return {
        "id": "",
        "room_id": room_id,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "content": content,
        "timestamp": timestamp,
        "origin": origin,
        "model": model,
        "processing_ms": processing_ms,
        "usage_prompt_tokens": usage_prompt_tokens,
        "usage_completion_tokens": usage_completion_tokens,
        "behavior_intent": behavior_values["intent"],
        "behavior_mood": behavior_values["mood"],
        "behavior_mood_intensity": behavior_values["mood_intensity"],
        "behavior_energy": behavior_values["energy"],
        "behavior_move": behavior_values["move"],
        "behavior_game_action": behavior_values["game_action"],
    }


async def _maybe_compact_room(room_id: str) -> dict | None:
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

        summary = await CompactionService.summarize_messages(to_summarize)

        RoomRepository.update_summary(room_id, summary)
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


@router.get("", response_model=RoomsListResponse)
async def list_rooms(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_user_exists(user_id)
    rooms = RoomRepository.get_for_user(user_id)
    return RoomsListResponse(rooms=[_serialize_room(room) for room in rooms], count=len(rooms))


@router.post("", response_model=RoomResponse)
async def create_room(
    request: CreateRoomRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_user_exists(user_id)

    for agent_id in request.agent_ids:
        if not UserRepository.can_access_agent(user_id, agent_id):
            raise forbidden(f"User cannot access agent '{agent_id}'")

    room = RoomRepository.create(
        name=request.name,
        created_by=user_id,
        agent_ids=request.agent_ids,
        settings=request.settings,
    )
    return _serialize_room(room)


@router.get("/{room_id}", response_model=RoomDetailResponse)
async def get_room(
    room_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    room = _ensure_room_access(user_id, room_id)
    agents = RoomRepository.get_agents(room_id)
    participants = RoomRepository.get_participants(room_id)
    return RoomDetailResponse(
        **room,
        agents=[_serialize_room_agent(agent) for agent in agents],
        participants=[_serialize_participant(p) for p in participants],
    )


@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: str,
    request: UpdateRoomRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)
    updated = RoomRepository.update(room_id, name=request.name, settings=request.settings)
    if not updated:
        raise not_found("Room")
    return _serialize_room(updated)


@router.delete("/{room_id}", response_model=DeleteResponse)
async def delete_room(
    room_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)
    deleted = RoomRepository.delete(room_id)
    if not deleted:
        raise not_found("Room")
    return DeleteResponse(deleted=1)


@router.get("/{room_id}/agents", response_model=RoomAgentListResponse)
async def list_room_agents(
    room_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)
    agents = RoomRepository.get_agents(room_id)
    return RoomAgentListResponse(
        room_id=room_id,
        agents=[_serialize_room_agent(agent) for agent in agents],
        count=len(agents),
    )


@router.post("/{room_id}/agents", response_model=RoomAgentResponse)
async def add_room_agent(
    room_id: str,
    request: AddRoomAgentRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)

    if not UserRepository.can_access_agent(user_id, request.agent_id):
        raise forbidden("User cannot access this agent")

    if not AgentRepository.get_by_id(request.agent_id):
        raise not_found("Agent")

    added = RoomRepository.add_agent(
        room_id,
        request.agent_id,
        added_by=user_id,
        response_mode=request.response_mode,
        role=request.role,
    )
    if not added:
        raise bad_request("Failed to add agent")
    return _serialize_room_agent(added)


@router.patch("/{room_id}/agents/{agent_id}", response_model=RoomAgentResponse)
async def update_room_agent(
    room_id: str,
    agent_id: str,
    request: UpdateRoomAgentRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)

    updated = RoomRepository.update_agent(
        room_id,
        agent_id,
        response_mode=request.response_mode,
        role=request.role,
    )
    if not updated:
        raise not_found("Room agent")
    return _serialize_room_agent(updated)


@router.delete("/{room_id}/agents/{agent_id}", response_model=DeleteResponse)
async def remove_room_agent(
    room_id: str,
    agent_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)

    agents = RoomRepository.get_agents(room_id)
    if len(agents) <= 1:
        raise bad_request("Room must keep at least one agent")

    removed = RoomRepository.remove_agent(room_id, agent_id)
    if not removed:
        raise not_found("Room agent")
    return DeleteResponse(deleted=1)


@router.get("/{room_id}/history", response_model=RoomHistoryResponse)
async def get_room_history(
    room_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    limit: int = Query(50, ge=1, le=200),
    include_runtime: bool = Query(False, alias="includeRuntime"),
):
    _ensure_room_access(user_id, room_id)

    messages = RoomMessageRepository.get_by_room(
        room_id,
        limit=limit,
        include_game_runtime=include_runtime,
    )

    return RoomHistoryResponse(
        room_id=room_id,
        messages=[_serialize_room_message(message) for message in messages],
        count=len(messages),
    )


@router.post("/{room_id}/chat", response_model=RoomChatResponse)
async def room_chat(
    room_id: str,
    request: RoomChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0, ge=0, le=1),
    user_id: str = Depends(get_user_id),
):
    _ensure_room_access(user_id, room_id)
    room_agents = RoomRepository.get_agents(room_id)
    if not room_agents:
        raise bad_request("Room has no agents")

    responding_agents = determine_responding_agents(
        user_message=request.message,
        mention_agents=request.mention_agents,
        room_agents=room_agents,
    )
    if not responding_agents:
        raise bad_request("No agents selected to respond")

    selected_games_v2_agents = [
        agent for agent in responding_agents
        if settings.is_games_v2_enabled_for_agent(agent.get("agent_id"))
    ]
    games_v2_enabled_for_request = bool(selected_games_v2_agents)
    runtime_trigger = bool(request.runtime_trigger) if games_v2_enabled_for_request else False
    if not games_v2_enabled_for_request and (request.runtime_trigger or request.game_context):
        logger.info(
            "[RoomChat] Ignoring game payload because Games V2 rollout is disabled "
            "for selected agents in room %s",
            room_id,
        )
    emotion_input_message = "" if runtime_trigger else request.message

    user_msg = RoomMessageRepository.add(
        room_id=room_id,
        sender_type="user",
        sender_id=user_id,
        content=request.message,
        origin="game_runtime" if runtime_trigger else "chat",
    )
    user_msg_id = user_msg.get("id")

    if stream == 1:
        return StreamingResponse(
            _stream_room_chat_sse(
                room_id=room_id,
                user_id=user_id,
                message=request.message,
                game_context=request.game_context,
                runtime_trigger=runtime_trigger,
                room_agents=room_agents,
                responding_agents=responding_agents,
                user_msg_id=user_msg_id,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    responses: list[RoomChatAgentResponse] = []

    for agent in responding_agents:
        agent_id = agent["agent_id"]
        agent_config = AgentRepository.get_by_id(agent_id) or {}
        agent_workspace = agent_config.get("workspace")
        started_at = time.time()

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
                None,
            )

            game_context = request.game_context if settings.is_games_v2_enabled_for_agent(agent_id) else None
            llm_messages = build_room_llm_messages(
                room_id=room_id,
                agent=agent,
                all_room_agents=room_agents,
                history_limit=settings.chat_history_limit,
                emotional_context=emotional_context,
                include_game_runtime=bool(game_context),
            )
            llm_messages = _inject_first_turn_context_if_present(llm_messages, first_turn_context)
            llm_messages = _inject_game_context_if_present(llm_messages, agent_id, game_context)

            result = await _call_llm_non_stream(agent, llm_messages, room_id)
            parsed = parse_chat_completion(result)
            processing_ms = int((time.time() - started_at) * 1000)

            behavior = parsed.get("behavior", {})
            usage = result.get("usage") or {}

            stored = RoomMessageRepository.add(
                room_id=room_id,
                sender_type="agent",
                sender_id=agent_id,
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

            _spawn_background(asyncio.to_thread(
                _process_emotion_post_llm,
                user_id,
                agent_id,
                behavior,
                f"room:{room_id}",
                pre_llm_triggers,
                None if runtime_trigger else request.message,
            ))

            if isinstance(agent_workspace, str) and agent_workspace.strip():
                state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
                interaction_count = int(state_row.get("interaction_count") or 0)
                game_id_value = _ctx_value(game_context, "game_id", "gameId")
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

            msg_for_response = {
                **_room_message_row(
                    room_id=room_id,
                    sender_type="agent",
                    sender_id=agent_id,
                    sender_name=agent.get("display_name") or agent_id,
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

            responses.append(
                RoomChatAgentResponse(
                    agent_id=agent_id,
                    agent_name=agent.get("display_name") or agent_id,
                    message=_serialize_room_message(msg_for_response),
                    processing_ms=processing_ms,
                    model=result.get("model"),
                    usage=usage,
                )
            )
        except httpx.TimeoutException:
            logger.exception("Room chat timeout for agent %s", agent_id)
        except Exception:
            logger.exception("Room chat failure for agent %s", agent_id)

    if not responses:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        raise service_unavailable("Room chat")

    _spawn_background(_maybe_compact_room(room_id))

    return RoomChatResponse(room_id=room_id, responses=responses, count=len(responses))


async def _stream_room_chat_sse(
    room_id: str,
    user_id: str,
    message: str,
    game_context: object | None,
    runtime_trigger: bool,
    room_agents: list[dict],
    responding_agents: list[dict],
    user_msg_id: str | None = None,
):
    emotion_input_message = "" if runtime_trigger else message
    post_llm_user_message = None if runtime_trigger else message
    successful_replies = 0

    for agent in responding_agents:
        agent_id = agent["agent_id"]
        clawdbot_agent_id = agent["clawdbot_agent_id"]
        agent_config = AgentRepository.get_by_id(agent_id) or {}
        agent_workspace = agent_config.get("workspace")
        chat_mode = normalize_chat_mode(agent_config.get("chat_mode"))
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
                None,
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
            llm_messages = _inject_first_turn_context_if_present(llm_messages, first_turn_context)
            llm_messages = _inject_game_context_if_present(llm_messages, agent_id, effective_game_context)

            usage = None
            full_content = ""
            if chat_mode == "direct":
                direct_client = DirectLLMClient(
                    api_base=resolve_direct_api_base(agent_config),
                )
                direct_messages = prepend_webapp_system_prompt(
                    normalize_messages_for_direct(llm_messages),
                    agent_workspace,
                    timezone=settings.default_timezone,
                )
                claw_id = agent_config.get("clawdbot_agent_id") or ""
                try:
                    tool_result = await run_tool_loop(
                        client=direct_client,
                        model=resolve_direct_model(agent_config),
                        messages=direct_messages,
                        workspace=agent_workspace,
                        claw_agent_id=claw_id,
                        user_tag=f"emilia:room:{room_id}",
                        timeout_s=120.0,
                    )
                    usage = tool_result.get("usage")
                    choices = tool_result.get("choices", [])
                    if choices:
                        content = (choices[0].get("message") or {}).get("content", "")
                        if content:
                            if len(content) > MAX_RESPONSE_CHARS:
                                logger.warning(
                                    "[Room SSE] Response for %s exceeded %d chars, truncating",
                                    agent_id,
                                    MAX_RESPONSE_CHARS,
                                )
                                content = content[:MAX_RESPONSE_CHARS]
                            full_content = content
                            yield f"data: {json.dumps({'content': content, 'agent_id': agent_id})}\n\n"
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
                    logger.exception("Room direct stream HTTP error for %s", agent_id)
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
            else:
                # OpenClaw mode: inject only webapp-specific behavior format (for avatar animation)
                from services.direct_llm import build_webapp_system_instructions
                webapp_instructions = build_webapp_system_instructions(
                    chat_mode="openclaw",
                    include_behavior_format=True,
                )
                openclaw_messages = [
                    {"role": "system", "content": webapp_instructions},
                    *llm_messages,
                ]

                async with httpx.AsyncClient(timeout=120.0) as client:
                    async with client.stream(
                        "POST",
                        f"{settings.clawdbot_url}/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.clawdbot_token}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": f"agent:{clawdbot_agent_id}",
                            "messages": openclaw_messages,
                            "stream": True,
                            "stream_options": {"include_usage": True},
                            "user": f"emilia:room:{room_id}",
                        },
                    ) as response:
                        if response.status_code != 200:
                            payload = {
                                "agent_id": agent_id,
                                "agent_name": agent_name,
                                "error": f"Chat service error ({response.status_code})",
                            }
                            yield f"event: agent_error\ndata: {json.dumps(payload)}\n\n"
                            continue

                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue

                            data_str = line[6:].strip()
                            if not data_str or data_str == "[DONE]":
                                continue

                            try:
                                data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            if "usage" in data:
                                usage = data["usage"]

                            choices = data.get("choices") or []
                            if not choices:
                                continue

                            delta = choices[0].get("delta") or {}
                            chunk = delta.get("content") or ""
                            if chunk:
                                allowed = MAX_RESPONSE_CHARS - len(full_content)
                                if allowed <= 0:
                                    logger.warning(
                                        "[Room SSE] Response for %s exceeded %d chars, truncating",
                                        agent_id,
                                        MAX_RESPONSE_CHARS,
                                    )
                                    break

                                chunk_to_send = chunk[:allowed]
                                full_content += chunk_to_send
                                if chunk_to_send:
                                    yield f"data: {json.dumps({'content': chunk_to_send, 'agent_id': agent_id})}\n\n"

                                if len(chunk) > len(chunk_to_send):
                                    logger.warning(
                                        "[Room SSE] Response for %s exceeded %d chars, truncating",
                                        agent_id,
                                        MAX_RESPONSE_CHARS,
                                    )
                                    break

                            if choices[0].get("finish_reason"):
                                break

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
                **_room_message_row(
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
                "message": _serialize_room_message(done_message).model_dump(),
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
        _spawn_background(_maybe_compact_room(room_id))

    yield f"data: {json.dumps({'done': True, 'room_id': room_id})}\n\n"
