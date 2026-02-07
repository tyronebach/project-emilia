"""Chat and media routes (chat, transcribe, speak)"""
import time
import json
import base64
import asyncio
from typing import Optional
import httpx
import websockets
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Query, Header
from fastapi.responses import StreamingResponse
from dependencies import verify_token
from schemas import ChatRequest, SpeakRequest
from config import settings
from parse_chat import parse_chat_completion, extract_avatar_commands
import database as db

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0),
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_agent_id: str = Header(..., alias="X-Agent-Id"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-Id")
):
    """Send message to agent"""
    start_time = time.time()

    user = db.get_user(x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not db.user_can_access_agent(x_user_id, x_agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    agent = db.get_agent(x_agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    clawdbot_agent_id = agent["clawdbot_agent_id"]

    # Get or create session
    if x_session_id:
        session = db.get_session(x_session_id)
        if not session or not db.user_can_access_session(x_user_id, x_session_id):
            raise HTTPException(status_code=403, detail="Cannot access this session")
    else:
        session = db.get_or_create_default_session(x_user_id, x_agent_id)

    session_id = session["id"]

    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(request, start_time, clawdbot_agent_id, session_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": f"agent:{clawdbot_agent_id}",
                "messages": [{"role": "user", "content": request.message}],
                "stream": False,
                "user": session_id
            }

            response = await client.post(
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json"
                },
                json=payload
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)

            result = response.json()

        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)

        db.update_session_last_used(session_id)
        db.increment_session_message_count(session_id)

        behavior = parsed.get("behavior", {})

        return {
            "response": parsed["response_text"],
            "session_id": session_id,
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
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "model": f"agent:{clawdbot_agent_id}",
                "messages": [{"role": "user", "content": request.message}],
                "stream": True,
                "stream_options": {"include_usage": True},
                "user": session_id
            }

            async with client.stream(
                "POST",
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json"
                },
                json=payload
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
                            # Stream raw content - we'll extract tags at the end
                            yield f"data: {json.dumps({'content': chunk})}\n\n"

                        if choices[0].get("finish_reason"):
                            break

                    except json.JSONDecodeError:
                        continue

                # Final response - extract behavior tags from full content
                clean_full, behavior = extract_avatar_commands(full_content)
                processing_ms = int((time.time() - start_time) * 1000)

                # Send avatar event with behavior data
                avatar_data = {}
                if behavior.get("intent"):
                    avatar_data["intent"] = behavior["intent"]
                if behavior.get("mood"):
                    avatar_data["mood"] = behavior["mood"]
                    avatar_data["intensity"] = behavior["mood_intensity"]
                if behavior.get("energy"):
                    avatar_data["energy"] = behavior["energy"]
                if avatar_data:
                    yield f"event: avatar\ndata: {json.dumps(avatar_data)}\n\n"

                db.update_session_last_used(session_id)
                db.increment_session_message_count(session_id)

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

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    token: str = Depends(verify_token)
):
    """Transcribe audio via STT service"""
    try:
        audio_data = await audio.read()

        # Ensure we have valid content type
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


@router.post("/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id")
):
    """Text-to-speech via ElevenLabs with-timestamps API for lip sync alignment"""
    from services.elevenlabs import ElevenLabsService
    from core.exceptions import TTSError
    
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=503, detail="TTS not configured")

    voice_id = request.voice_id or settings.elevenlabs_voice_id

    # Get agent-specific voice if available (unless explicitly overridden)
    if x_agent_id and not request.voice_id:
        agent = db.get_agent(x_agent_id)
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
