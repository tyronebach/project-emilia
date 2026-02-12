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
    RoomMessageRepository,
    RoomRepository,
    UserRepository,
)
from dependencies import get_user_id, verify_token
from parse_chat import extract_avatar_commands, parse_chat_completion, coalesce_response_text
from routers.chat import (
    _process_emotion_post_llm,
    _process_emotion_pre_llm,
    _resolve_trusted_prompt_instructions,
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
    prepend_workspace_soul,
    resolve_direct_api_base,
    resolve_direct_model,
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
    game_context: dict | None,
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


def _normalize_messages_for_direct(messages: list[dict]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"}:
            continue
        if not isinstance(content, str):
            continue
        normalized.append({"role": role, "content": content})
    return normalized


async def _call_llm_non_stream(agent: dict, messages: list[dict], room_id: str) -> dict:
    agent_id = str(agent.get("agent_id") or "")
    agent_config = AgentRepository.get_by_id(agent_id) if agent_id else None
    chat_mode = normalize_chat_mode((agent_config or {}).get("chat_mode"))

    if chat_mode == "direct":
        direct_client = DirectLLMClient(
            api_base=resolve_direct_api_base(agent_config),
        )
        direct_messages = prepend_workspace_soul(
            _normalize_messages_for_direct(messages),
            (agent_config or {}).get("workspace"),
        )
        return await direct_client.chat_completion(
            model=resolve_direct_model(agent_config),
            messages=direct_messages,
            user_tag=f"emilia:room:{room_id}",
            timeout_s=60.0,
        )

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
                "messages": messages,
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

    RoomMessageRepository.add(
        room_id=room_id,
        sender_type="user",
        sender_id=user_id,
        content=request.message,
        origin="chat",
    )

    if stream == 1:
        return StreamingResponse(
            _stream_room_chat_sse(
                room_id=room_id,
                user_id=user_id,
                message=request.message,
                game_context=request.game_context,
                room_agents=room_agents,
                responding_agents=responding_agents,
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
        started_at = time.time()

        try:
            emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
                user_id,
                agent_id,
                request.message,
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
                None,
                pre_llm_triggers,
                request.message,
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
        raise service_unavailable("Room chat")

    return RoomChatResponse(room_id=room_id, responses=responses, count=len(responses))


async def _stream_room_chat_sse(
    room_id: str,
    user_id: str,
    message: str,
    game_context: dict | None,
    room_agents: list[dict],
    responding_agents: list[dict],
):
    for agent in responding_agents:
        agent_id = agent["agent_id"]
        clawdbot_agent_id = agent["clawdbot_agent_id"]
        agent_config = AgentRepository.get_by_id(agent_id) or {}
        chat_mode = normalize_chat_mode(agent_config.get("chat_mode"))
        agent_name = agent.get("display_name") or agent_id
        started_at = time.time()

        yield f"event: agent_start\ndata: {json.dumps({'agent_id': agent_id, 'agent_name': agent_name})}\n\n"

        try:
            emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
                user_id,
                agent_id,
                message,
                None,
            )

            effective_game_context = game_context if settings.is_games_v2_enabled_for_agent(agent_id) else None
            llm_messages = build_room_llm_messages(
                room_id=room_id,
                agent=agent,
                all_room_agents=room_agents,
                history_limit=settings.chat_history_limit,
                emotional_context=emotional_context,
                include_game_runtime=bool(effective_game_context),
            )
            llm_messages = _inject_game_context_if_present(llm_messages, agent_id, effective_game_context)

            usage = None
            full_content = ""
            if chat_mode == "direct":
                direct_client = DirectLLMClient(
                    api_base=resolve_direct_api_base(agent_config),
                )
                direct_messages = prepend_workspace_soul(
                    _normalize_messages_for_direct(llm_messages),
                    agent_config.get("workspace"),
                )
                try:
                    async for data in direct_client.stream_chat_completion(
                        model=resolve_direct_model(agent_config),
                        messages=direct_messages,
                        user_tag=f"emilia:room:{room_id}",
                        timeout_s=120.0,
                    ):
                        if "usage" in data:
                            usage = data["usage"]

                        choices = data.get("choices") or []
                        if not choices:
                            continue

                        delta = choices[0].get("delta") or {}
                        chunk = delta.get("content") or ""
                        if chunk:
                            full_content += chunk
                            yield f"data: {json.dumps({'content': chunk, 'agent_id': agent_id})}\n\n"

                        if choices[0].get("finish_reason"):
                            break
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
                            "messages": llm_messages,
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
                                full_content += chunk
                                yield f"data: {json.dumps({'content': chunk, 'agent_id': agent_id})}\n\n"

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
                None,
                pre_llm_triggers,
                message,
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
            yield f"event: agent_done\ndata: {json.dumps(payload)}\n\n"

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

    yield f"data: {json.dumps({'done': True, 'room_id': room_id})}\n\n"
