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
from services.chat_runtime.pipeline import process_message
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
from services.memory.auto_capture import maybe_autocapture_memory
from services.memory.top_of_mind import build_top_of_mind_context
from services.observability import log_metric
from services.room_chat import (
    determine_responding_agents,
    extract_behavior_dict,
    prepare_agent_turn_context,
    room_message_row,
    schedule_post_llm_tasks,
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


def _serialize_room_message(message: dict) -> RoomMessageResponse:
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
    try:
        result = await process_message(
            user_id=user_id,
            agent_id=None,
            room_id=room_id,
            message=request.message,
            stream=bool(stream),
            mention_agents=request.mention_agents,
            game_context=request.game_context,
            runtime_trigger=bool(request.runtime_trigger),
            determine_responding_agents_fn=determine_responding_agents,
            is_games_v2_enabled_for_agent_fn=settings.is_games_v2_enabled_for_agent,
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
            logger_obj=logger,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail in {"Room has no agents", "No agents selected to respond"}:
            raise bad_request(detail)
        raise service_unavailable(detail)
    except RuntimeError:
        raise service_unavailable("Room chat")

    if stream == 1:
        return StreamingResponse(
            result,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return RoomChatResponse(**result)
