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
from parse_chat import parse_chat_completion
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
from services.llm_caller import call_llm_non_stream
from services.room_chat import (
    build_room_llm_messages,
    determine_responding_agents,
    extract_behavior_dict,
    inject_first_turn_context_if_present,
    inject_game_context_if_present,
    room_message_row,
)
from services.room_chat_stream import (
    maybe_compact_room,
    serialize_room_message,
    stream_room_chat_sse,
)

logger = logging.getLogger(__name__)

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


def _message_behavior(message: dict) -> dict:
    return extract_behavior_dict(
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


@router.get("", response_model=RoomsListResponse)
async def list_rooms(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str | None = Query(None, description="Filter rooms containing this agent"),
):
    _ensure_user_exists(user_id)
    rooms = RoomRepository.get_for_user(user_id, agent_id=agent_id)
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

    # Auto-detect room_type: 1 agent = DM, 2+ agents = group
    room_type = request.room_type or ("dm" if len(request.agent_ids) == 1 else "group")

    room = RoomRepository.create(
        name=request.name,
        created_by=user_id,
        agent_ids=request.agent_ids,
        settings=request.settings,
        room_type=room_type,
    )

    # DM agents always respond (no mention required)
    if room_type == "dm" and len(request.agent_ids) == 1:
        RoomRepository.update_agent(room["id"], request.agent_ids[0], response_mode="always")

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
            stream_room_chat_sse(
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
            llm_messages = inject_first_turn_context_if_present(llm_messages, first_turn_context)
            llm_messages = inject_game_context_if_present(llm_messages, agent_id, game_context)

            result = await call_llm_non_stream({**agent, "user_id": user_id}, llm_messages, room_id)
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
                **room_message_row(
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

    _spawn_background(maybe_compact_room(room_id))

    return RoomChatResponse(room_id=room_id, responses=responses, count=len(responses))
