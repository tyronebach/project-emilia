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

        return {
            "response": parsed["response_text"],
            "session_id": session_id,
            "processing_ms": processing_ms,
            "model": result.get("model"),
            "moods": parsed.get("moods", []),
            "animations": parsed.get("animations", []),
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

                # Final response - extract moods/animations from full content
                clean_full, moods, animations = extract_avatar_commands(full_content)
                processing_ms = int((time.time() - start_time) * 1000)

                # Send avatar events for extracted moods/animations
                for m in moods:
                    yield f"event: avatar\ndata: {json.dumps({'mood': m['mood'], 'intensity': m['intensity']})}\n\n"
                for a in animations:
                    yield f"event: avatar\ndata: {json.dumps({'animation': a})}\n\n"

                db.update_session_last_used(session_id)
                db.increment_session_message_count(session_id)

                final = {
                    "done": True,
                    "response": clean_full,
                    "session_id": session_id,
                    "processing_ms": processing_ms,
                    "moods": moods,
                    "animations": animations
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
    """Text-to-speech via ElevenLabs"""
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

    ws_url = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={settings.elevenlabs_model}&output_format=mp3_44100_128"

    try:
        audio_chunks = []
        # Accumulate alignment data from multiple chunks
        all_chars = []
        all_start_times = []
        all_end_times = []

        async with websockets.connect(
            ws_url,
            additional_headers={"xi-api-key": settings.elevenlabs_api_key}
        ) as ws:
            # Send initial config
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                "generation_config": {"chunk_length_schedule": [120, 160, 250, 290]},
                "xi_api_key": settings.elevenlabs_api_key
            }))

            # Send text with alignment request
            await ws.send(json.dumps({
                "text": text,
                "try_trigger_generation": True,
                "flush": True,
                "alignment": True
            }))

            await ws.send(json.dumps({"text": ""}))

            # Receive audio
            while True:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
                    data = json.loads(msg)

                    if data.get("audio"):
                        audio_chunks.append(base64.b64decode(data["audio"]))

                    if data.get("alignment"):
                        chunk = data["alignment"]
                        all_chars.extend(chunk.get("characters", []))
                        all_start_times.extend(chunk.get("character_start_times_seconds", []))
                        all_end_times.extend(chunk.get("character_end_times_seconds", []))

                    if data.get("isFinal"):
                        break

                except asyncio.TimeoutError:
                    break

        if not audio_chunks:
            raise HTTPException(status_code=500, detail="No audio generated")

        audio_bytes = b"".join(audio_chunks)
        audio_base64 = base64.b64encode(audio_bytes).decode()

        transformed_alignment = None
        if all_chars:
            charStartTimesMs = [int(t * 1000) for t in all_start_times]
            max_len = min(len(all_start_times), len(all_end_times))
            charDurationsMs = [
                int((all_end_times[i] - all_start_times[i]) * 1000)
                for i in range(max_len)
            ]
            transformed_alignment = {
                "chars": all_chars,
                "charStartTimesMs": charStartTimesMs,
                "charDurationsMs": charDurationsMs
            }

        return {
            "audio_base64": audio_base64,
            "alignment": transformed_alignment,
            "voice_id": voice_id,
            "duration_estimate": len(audio_bytes) / (44100 * 2 / 8)
        }

    except websockets.exceptions.WebSocketException as e:
        raise HTTPException(status_code=503, detail=f"TTS WebSocket error: {e}")
