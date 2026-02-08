"""Chat and media routes (chat, transcribe, speak)"""
# Phase 1.6 COMPLETE - 2026-02-08
import time
import json
import logging
import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from dependencies import verify_token, get_user_id, get_agent_id, get_optional_agent_id, get_session_id
from schemas import ChatRequest, SpeakRequest
from config import settings
from core.exceptions import TTSError
from parse_chat import parse_chat_completion, extract_avatar_commands
from db.repositories import UserRepository, AgentRepository, SessionRepository, MessageRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


def inject_game_context(message: str, game_context: dict | None) -> str:
    """Append game context to the user's message for the LLM prompt."""
    if not game_context:
        return message

    game_id = game_context.get("gameId", "unknown")
    prompt_instructions = game_context.get("promptInstructions") or ""
    state = game_context.get("state") or ""
    last_move = game_context.get("lastUserMove") or ""
    avatar_move = game_context.get("avatarMove")
    valid_moves = game_context.get("validMoves") or []
    status = game_context.get("status", "in_progress")

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


def _build_llm_messages(session_id: str, current_msg: str, game_context: dict | None) -> list[dict]:
    """Build the messages array for the LLM: raw history + current message with game context."""
    history = MessageRepository.get_last_n(session_id, settings.chat_history_limit)

    messages = [{"role": m["role"], "content": m["content"]} for m in history]

    current_content = inject_game_context(current_msg, game_context)
    messages.append({"role": "user", "content": current_content})

    return messages


@router.post("/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
    session_id: str | None = Depends(get_session_id)
):
    start_time = time.time()

    user = UserRepository.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not UserRepository.can_access_agent(user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    clawdbot_agent_id = agent["clawdbot_agent_id"]

    if session_id:
        session = SessionRepository.get_by_id(session_id)
        if not session or not SessionRepository.user_can_access(user_id, session_id):
            raise HTTPException(status_code=403, detail="Cannot access this session")
    else:
        session = SessionRepository.get_or_create_default(user_id, agent_id)

    sid = session["id"]

    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(request, start_time, clawdbot_agent_id, sid),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming
    try:
        # Build messages array: raw history + current message with game context
        messages = _build_llm_messages(sid, request.message, request.game_context)

        # Store raw user message BEFORE calling LLM
        MessageRepository.add(sid, "user", request.message)

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": f"agent:{clawdbot_agent_id}",
                    "messages": messages,
                    "stream": False,
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Chat service error")

            result = response.json()

        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)

        # Store assistant response with metadata
        behavior = parsed.get("behavior", {})
        usage = result.get("usage") or {}
        MessageRepository.add(
            sid, "assistant", parsed["response_text"],
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

        SessionRepository.update_last_used(sid)
        SessionRepository.increment_message_count(sid)

        return {
            "response": parsed["response_text"],
            "session_id": sid,
            "processing_ms": processing_ms,
            "model": result.get("model"),
            "behavior": behavior,
            "usage": result.get("usage")
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Service unavailable")


async def _stream_chat_sse(request: ChatRequest, start_time: float, clawdbot_agent_id: str, session_id: str):
    """SSE streaming chat"""
    try:
        # Build messages array: raw history + current message with game context
        messages = _build_llm_messages(session_id, request.message, request.game_context)

        # Store raw user message BEFORE calling LLM
        MessageRepository.add(session_id, "user", request.message)

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": f"agent:{clawdbot_agent_id}",
                    "messages": messages,
                    "stream": True,
                    "stream_options": {"include_usage": True},
                }
            ) as response:
                if response.status_code != 200:
                    yield f"data: {json.dumps({'error': 'API error'})}\n\n"
                    return

                full_content = ""
                usage = None

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        continue

                    try:
                        data = json.loads(data_str)

                        if "usage" in data:
                            usage = data["usage"]

                        choices = data.get("choices", [])
                        if not choices:
                            continue

                        delta = choices[0].get("delta", {})
                        chunk = delta.get("content", "")

                        if chunk:
                            full_content += chunk
                            yield f"data: {json.dumps({'content': chunk})}\n\n"

                        if choices[0].get("finish_reason"):
                            break

                    except json.JSONDecodeError:
                        continue

                # Final response - extract behavior tags from full content
                clean_full, behavior = extract_avatar_commands(full_content)
                processing_ms = int((time.time() - start_time) * 1000)

                # Store assistant response with metadata
                usage_data = usage or {}
                MessageRepository.add(
                    session_id, "assistant", clean_full,
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

                avatar_data = {}
                if behavior.get("intent"):
                    avatar_data["intent"] = behavior["intent"]
                if behavior.get("mood"):
                    avatar_data["mood"] = behavior["mood"]
                    avatar_data["intensity"] = behavior["mood_intensity"]
                if behavior.get("energy"):
                    avatar_data["energy"] = behavior["energy"]
                if behavior.get("move"):
                    avatar_data["move"] = behavior["move"]
                if behavior.get("game_action"):
                    avatar_data["game_action"] = behavior["game_action"]
                if avatar_data:
                    yield f"event: avatar\ndata: {json.dumps(avatar_data)}\n\n"

                SessionRepository.update_last_used(session_id)
                SessionRepository.increment_message_count(session_id)

                final = {
                    "done": True,
                    "response": clean_full,
                    "session_id": session_id,
                    "processing_ms": processing_ms,
                    "behavior": behavior
                }
                if usage:
                    final["usage"] = usage

                yield f"data: {json.dumps(final)}\n\n"

    except Exception:
        logger.exception("Streaming error")
        yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
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
        raise HTTPException(status_code=504, detail="STT timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="STT unavailable")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription error")
        raise HTTPException(status_code=500, detail="Transcription error")


@router.post("/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    """Text-to-speech via ElevenLabs with-timestamps API for lip sync alignment"""
    from services.elevenlabs import ElevenLabsService

    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=503, detail="TTS not configured")

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
        raise HTTPException(status_code=503, detail=str(e))
