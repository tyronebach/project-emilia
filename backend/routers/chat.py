"""Chat facade + media routes (chat, transcribe, speak).

The /api/chat endpoint is a thin compatibility facade that resolves a DM room
for the (user, agent) pair and delegates to the room chat pipeline.
"""
import asyncio
import json
import logging
import time
import httpx
from fastapi import APIRouter, UploadFile, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from dependencies import verify_token, get_user_id, get_agent_id, get_optional_agent_id
from schemas import ChatRequest, SpeakRequest
from config import settings
from core.exceptions import TTSError, not_found, forbidden, service_unavailable, timeout_error
from parse_chat import parse_chat_completion
from db.repositories import (
    UserRepository,
    AgentRepository,
    RoomRepository,
    RoomMessageRepository,
    EmotionalStateRepository,
)
from services.background_tasks import spawn_background as _spawn_background
from services.emotion_runtime import (
    process_emotion_post_llm as _process_emotion_post_llm,
    process_emotion_pre_llm as _process_emotion_pre_llm,
)
from services.chat_context_runtime import (
    build_first_turn_context as _build_first_turn_context,
    ctx_value as _ctx_value,
    ensure_workspace_milestones as _ensure_workspace_milestones,
    safe_get_mood_snapshot as _safe_get_mood_snapshot,
)
from services.llm_caller import call_llm_non_stream
from services.room_chat import (
    build_room_llm_messages,
    determine_responding_agents,
    inject_first_turn_context_if_present,
    inject_game_context_if_present,
)
from services.room_chat_stream import maybe_compact_room, stream_room_chat_sse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    """DM chat facade — resolves a DM room and delegates to room chat pipeline."""
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")

    # Use explicit room_id if provided, otherwise auto-resolve DM room
    if request.room_id:
        if not RoomRepository.user_can_access(user_id, request.room_id):
            raise forbidden("User cannot access this room")
        room = RoomRepository.get_by_id(request.room_id)
        if not room:
            raise not_found("Room")
        room_id = room["id"]
    else:
        room = RoomRepository.get_or_create_dm_room(user_id, agent_id)
        room_id = room["id"]

    room_agents = RoomRepository.get_agents(room_id)
    if not room_agents:
        raise service_unavailable("No agents in room")

    responding_agents = determine_responding_agents(
        user_message=request.message,
        mention_agents=None,
        room_agents=room_agents,
    )

    games_v2_enabled = settings.is_games_v2_enabled_for_agent(agent_id)
    game_context = request.game_context if games_v2_enabled else None
    runtime_trigger = bool(request.runtime_trigger) if games_v2_enabled else False

    # Store user message
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
            _dm_stream_wrapper(
                room_id=room_id,
                user_id=user_id,
                agent_id=agent_id,
                message=request.message,
                game_context=game_context,
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

    # Non-streaming: run room chat orchestration for the single DM agent
    start_time = time.time()
    emotion_input_message = "" if runtime_trigger else request.message
    agent_data = responding_agents[0]
    agent_config = AgentRepository.get_by_id(agent_id) or {}
    agent_workspace = agent_config.get("workspace")

    try:
        is_first_turn = (
            not runtime_trigger
            and RoomMessageRepository.get_agent_reply_count(room_id, agent_id) == 0
        )
        first_turn_context = (
            _build_first_turn_context(
                user_id, agent_id,
                agent_workspace=agent_workspace if isinstance(agent_workspace, str) else None,
            )
            if is_first_turn else None
        )

        emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
            user_id, agent_id, emotion_input_message, None,
        )
        emotion_snapshot = _safe_get_mood_snapshot(user_id, agent_id)

        llm_messages = build_room_llm_messages(
            room_id=room_id,
            agent=agent_data,
            all_room_agents=room_agents,
            history_limit=settings.chat_history_limit,
            emotional_context=emotional_context,
            include_game_runtime=bool(game_context),
        )
        llm_messages = inject_first_turn_context_if_present(llm_messages, first_turn_context)
        llm_messages = inject_game_context_if_present(llm_messages, agent_id, game_context)

        result = await call_llm_non_stream({**agent_data, "user_id": user_id}, llm_messages, room_id)
        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)

        behavior = parsed.get("behavior", {})
        usage = result.get("usage") or {}

        RoomMessageRepository.add(
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
            user_id, agent_id, behavior, f"room:{room_id}",
            pre_llm_triggers, None if runtime_trigger else request.message,
        ))

        if isinstance(agent_workspace, str) and agent_workspace.strip():
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            interaction_count = int(state_row.get("interaction_count") or 0)
            game_id_value = _ctx_value(game_context, "game_id", "gameId")
            game_id = game_id_value.strip() if isinstance(game_id_value, str) and game_id_value.strip() else None
            _spawn_background(asyncio.to_thread(
                _ensure_workspace_milestones,
                agent_workspace=agent_workspace,
                user_id=user_id,
                agent_id=agent_id,
                interaction_count=interaction_count,
                runtime_trigger=runtime_trigger,
                game_id=game_id,
            ))

        _spawn_background(maybe_compact_room(room_id))

        resp = {
            "response": parsed["response_text"],
            "room_id": room_id,
            "processing_ms": processing_ms,
            "model": result.get("model"),
            "behavior": behavior,
            "usage": result.get("usage"),
        }

        if emotional_context or pre_llm_triggers or emotion_snapshot:
            resp["emotion_debug"] = {
                "triggers": [[t, round(i, 3)] for t, i in pre_llm_triggers],
                "context_block": emotional_context,
                "snapshot": emotion_snapshot,
            }

        return resp

    except httpx.TimeoutException:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        raise timeout_error("Chat")
    except httpx.ConnectError:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        raise service_unavailable("Chat")
    except ValueError as e:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        raise service_unavailable(str(e))
    except Exception:
        if user_msg_id:
            RoomMessageRepository.delete_by_id(user_msg_id)
        raise


async def _dm_stream_wrapper(
    room_id: str,
    user_id: str,
    agent_id: str,
    message: str,
    game_context,
    runtime_trigger: bool,
    room_agents: list[dict],
    responding_agents: list[dict],
    user_msg_id: str | None = None,
):
    """Wrap room SSE stream for legacy /api/chat streaming contract.

    Strips agent_id from content events and reshapes done event to match
    the old /api/chat format expected by the frontend SSE parser.
    """
    try:
        async for event_line in stream_room_chat_sse(
            room_id=room_id,
            user_id=user_id,
            message=message,
            game_context=game_context,
            runtime_trigger=runtime_trigger,
            room_agents=room_agents,
            responding_agents=responding_agents,
            user_msg_id=user_msg_id,
        ):
            if event_line.startswith("event: agent_start"):
                # Skip agent_start for DM (single agent, frontend doesn't expect it)
                continue
            elif event_line.startswith("event: agent_done"):
                # Reshape agent_done into legacy done event
                data_str = event_line.split("\ndata: ", 1)[-1].rstrip("\n")
                try:
                    data = json.loads(data_str)
                    msg = data.get("message", {})
                    done_payload = {
                        "done": True,
                        "response": msg.get("content", ""),
                        "room_id": room_id,
                        "processing_ms": data.get("processing_ms"),
                        "behavior": data.get("behavior", {}),
                    }
                    if data.get("usage"):
                        done_payload["usage"] = data["usage"]
                    yield f"data: {json.dumps(done_payload)}\n\n"
                except (json.JSONDecodeError, KeyError):
                    yield event_line
            elif event_line.startswith("event: avatar"):
                # Strip agent_id/agent_name for DM compat
                data_str = event_line.split("\ndata: ", 1)[-1].rstrip("\n")
                try:
                    data = json.loads(data_str)
                    data.pop("agent_id", None)
                    data.pop("agent_name", None)
                    if data:
                        yield f"event: avatar\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    yield event_line
            elif event_line.startswith("event: emotion"):
                # Strip agent_id/agent_name for DM compat
                data_str = event_line.split("\ndata: ", 1)[-1].rstrip("\n")
                try:
                    data = json.loads(data_str)
                    data.pop("agent_id", None)
                    data.pop("agent_name", None)
                    yield f"event: emotion\ndata: {json.dumps(data)}\n\n"
                except json.JSONDecodeError:
                    yield event_line
            elif event_line.startswith("event: agent_error"):
                # Reshape to legacy error format
                data_str = event_line.split("\ndata: ", 1)[-1].rstrip("\n")
                try:
                    data = json.loads(data_str)
                    yield f"data: {json.dumps({'error': data.get('error', 'Chat failed')})}\n\n"
                except json.JSONDecodeError:
                    yield event_line
            elif '"done": true' in event_line or '"done":true' in event_line:
                # Skip room-level done event (we sent our own via agent_done above)
                continue
            else:
                # Content events: strip agent_id for DM compat
                if event_line.startswith("data: "):
                    data_str = event_line[6:].rstrip("\n")
                    try:
                        data = json.loads(data_str)
                        data.pop("agent_id", None)
                        yield f"data: {json.dumps(data)}\n\n"
                    except json.JSONDecodeError:
                        yield event_line
                else:
                    yield event_line
    except Exception:
        logger.exception("DM stream wrapper error")
        yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile,
    token: str = Depends(verify_token)
):
    """Transcribe audio via STT service"""
    try:
        audio_data = await audio.read()
        content_type = audio.content_type or "audio/webm"
        filename = audio.filename or "recording.webm"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.stt_service_url}/transcribe",
                files={"audio": (filename, audio_data, content_type)}
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="STT failed")

            return response.json()

    except httpx.TimeoutException:
        raise timeout_error("STT")
    except httpx.ConnectError:
        raise service_unavailable("STT")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription error")
        raise service_unavailable("Transcription")


@router.post("/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    """Text-to-speech via ElevenLabs with-timestamps API for lip sync alignment"""
    from services.elevenlabs import ElevenLabsService

    if not settings.elevenlabs_api_key:
        raise service_unavailable("TTS")

    voice_id = request.voice_id or settings.elevenlabs_voice_id

    if agent_id and not request.voice_id:
        agent = AgentRepository.get_by_id(agent_id)
        if agent and agent.get("voice_id"):
            voice_id = agent["voice_id"]

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        result = await ElevenLabsService.synthesize(text, voice_id)
        return result
    except TTSError as e:
        raise service_unavailable(str(e))
