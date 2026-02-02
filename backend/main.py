#!/usr/bin/env python3
"""
Emilia Web App - Backend API
Proxies audio to STT service and manages sessions
Integrates with Clawdbot Brain for AI responses
"""
import os
import time
import httpx
import base64
import json
import asyncio
import websockets
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, PlainTextResponse, StreamingResponse


from parse_chat import parse_chat_completion, extract_avatar_commands
from users import load_users, get_user, get_user_session, create_new_session, get_user_sessions
from avatars import get_avatar, get_allowed_agent_ids


# Configuration
STT_SERVICE_URL = os.getenv("STT_SERVICE_URL", "http://192.168.88.252:8765")
CLAWDBOT_URL = os.getenv("CLAWDBOT_URL", "http://127.0.0.1:18789")

# Secrets MUST come from the environment (no hardcoded defaults).
# This prevents accidental leakage + makes misconfigurations obvious.
CLAWDBOT_TOKEN = os.getenv("CLAWDBOT_TOKEN")

# Optional default agent id (mainly for health/debugging).
CLAWDBOT_AGENT_ID = os.getenv("CLAWDBOT_AGENT_ID")

# Auth token: allow an explicit dev default only when AUTH_ALLOW_DEV_TOKEN=1.
AUTH_ALLOW_DEV_TOKEN = os.getenv("AUTH_ALLOW_DEV_TOKEN", "0") == "1"
AUTH_TOKEN = os.getenv("AUTH_TOKEN") or ("emilia-dev-token-2026" if AUTH_ALLOW_DEV_TOKEN else None)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")

if not CLAWDBOT_TOKEN:
    raise RuntimeError("Missing CLAWDBOT_TOKEN env var (required)")
ALLOWED_CLAWDBOT_AGENT_IDS = get_allowed_agent_ids()
if not ALLOWED_CLAWDBOT_AGENT_IDS:
    raise RuntimeError("No allowed agent ids found in data/avatars.json.")
if CLAWDBOT_AGENT_ID and CLAWDBOT_AGENT_ID not in ALLOWED_CLAWDBOT_AGENT_IDS:
    raise RuntimeError(
        f"Invalid CLAWDBOT_AGENT_ID={CLAWDBOT_AGENT_ID!r}. "
        f"Allowed: {sorted(ALLOWED_CLAWDBOT_AGENT_IDS)}."
    )

# TTS Configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel - Young, Gentle
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")  # Fast model

# Memory Configuration
EMILIA_WORKSPACE = os.getenv("EMILIA_WORKSPACE", "/home/tbach/clawd-emilia")
MEMORY_MD_PATH = Path(EMILIA_WORKSPACE) / "MEMORY.md"
MEMORY_DIR_PATH = Path(EMILIA_WORKSPACE) / "memory"

# Request models
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class CreateSessionRequest(BaseModel):
    name: Optional[str] = None

class SpeakRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None  # Override voice if provided


class SessionInfo(BaseModel):
    session_key: str
    display_id: str
    updated_at: Optional[int] = None
    model: Optional[str] = None

# Female ElevenLabs voices
VOICE_OPTIONS = {
    "rachel": {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "desc": "Young, calm"},
    "matilda": {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "desc": "Warm, friendly"},
    "grace": {"id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace", "desc": "Soft, gentle"},
    "charlotte": {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "desc": "Calm, seductive"},
    "alice": {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice", "desc": "Confident, clear"},
    "elli": {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "desc": "Young, emotional"},
    "domi": {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "desc": "Strong, confident"},
    "bella": {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "desc": "Soft, sweet"},
    "nicole": {"id": "piTKgcLEGmPE4e6mEKli", "name": "Nicole", "desc": "Whisper, ASMR"},
    "sarah": {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "desc": "Mature, reassuring"},
}

class MemoryUpdateRequest(BaseModel):
    content: str
    append: Optional[bool] = False  # If True, append instead of overwrite

# Initialize FastAPI
app = FastAPI(title="Emilia Web App API", version="1.0.0")


# ========================================
# CONSISTENT ERROR RESPONSE FORMAT
# ========================================

def make_error_response(status_code: int, error: str, detail: str = None) -> Dict[str, Any]:
    """Create a consistent error response dict."""
    response = {
        "error": error,
        "status_code": status_code
    }
    if detail:
        response["detail"] = detail
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Return consistent JSON error responses for all HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=make_error_response(
            status_code=exc.status_code,
            error=exc.detail,
            detail=f"Request: {request.method} {request.url.path}"
        )
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception):
    """Catch-all handler for unexpected errors."""
    import traceback
    error_id = f"ERR-{int(time.time())}"
    print(f"[{error_id}] Unexpected error: {exc}")
    print(traceback.format_exc())

    return JSONResponse(
        status_code=500,
        content=make_error_response(
            status_code=500,
            error="Internal server error",
            detail=f"Error ID: {error_id}. Check server logs for details."
        )
    )


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    # SECURITY: Do NOT use wildcard origins with credentials.
    # Keep this as an explicit allowlist.
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-Id", "X-Avatar-Id"],
)


def verify_token(authorization: Optional[str] = Header(None)):
    """Simple token-based auth"""
    if not authorization:
        return None

    if not AUTH_TOKEN:
        return None
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "")
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return token


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    # Check STT service health
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{STT_SERVICE_URL}/health")
            stt_healthy = response.status_code == 200
            stt_info = response.json() if stt_healthy else None
    except Exception as e:
        stt_healthy = False
        stt_info = {"error": str(e)}
    
    # Check Clawdbot Brain health
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{CLAWDBOT_URL}/health",
                headers={"Authorization": f"Bearer {CLAWDBOT_TOKEN}"}
            )
            brain_healthy = response.status_code == 200
            brain_info = response.json() if brain_healthy else None
    except Exception as e:
        brain_healthy = False
        brain_info = {"error": str(e)}
    
    return {
        "status": "ok",
        "api": "healthy",
        "stt_service": {
            "healthy": stt_healthy,
            "url": STT_SERVICE_URL,
            "info": stt_info
        },
        "brain_service": {
            "healthy": brain_healthy,
            "url": CLAWDBOT_URL,
            "agent_id": CLAWDBOT_AGENT_ID,
            "allowed_agent_ids": sorted(ALLOWED_CLAWDBOT_AGENT_IDS),
            "info": brain_info
        }
    }


@app.get("/api/users")
async def list_users(token: str = Depends(verify_token)):
    data = load_users()
    users = data.get("users") or {}
    items = []
    for user_id, user in users.items():
        avatar_ids = user.get("avatars") or []
        items.append(
            {
                "id": user_id,
                "display_name": user.get("display_name", user_id),
                "avatar_count": len(avatar_ids),
            }
        )
    return {"users": items, "count": len(items)}


@app.get("/api/users/{user_id}")
async def get_user_details(user_id: str, token: str = Depends(verify_token)):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar_ids = user.get("avatars") or []
    avatars = []
    for avatar_id in avatar_ids:
        avatar = get_avatar(avatar_id)
        if avatar:
            avatar_payload = {"id": avatar_id, **avatar}
            avatars.append(avatar_payload)

    return {
        "id": user_id,
        "display_name": user.get("display_name", user_id),
        "default_avatar": user.get("default_avatar"),
        "preferences": user.get("preferences") or {},
        "sessions": user.get("sessions") or {},
        "avatar_ids": avatar_ids,
        "avatars": avatars,
    }


@app.post("/api/users/{user_id}/select-avatar/{avatar_id}")
async def select_avatar(user_id: str, avatar_id: str, token: str = Depends(verify_token)):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar = get_avatar(avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    if avatar.get("owner") != user_id or avatar_id not in (user.get("avatars") or []):
        raise HTTPException(status_code=403, detail="Avatar does not belong to user")

    agent_id = avatar.get("agent_id")
    if not agent_id or agent_id not in ALLOWED_CLAWDBOT_AGENT_IDS:
        raise HTTPException(status_code=400, detail="Invalid avatar agent id")

    session_id = get_user_session(user_id, avatar_id)
    if not session_id:
        raise HTTPException(status_code=500, detail="Failed to create session")

    return {
        "user_id": user_id,
        "avatar_id": avatar_id,
        "agent_id": agent_id,
        "session_id": session_id,
    }


@app.post("/api/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    token: str = Depends(verify_token)
):
    """
    Transcribe audio file via STT service
    
    Returns: {
        "text": "...",
        "language": "en",
        "processing_ms": 123,
        "total_ms": 456
    }
    """
    start_time = time.time()
    
    try:
        # Read audio content
        audio_content = await audio.read()
        
        # Forward to STT service
        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {
                'audio': (
                    audio.filename or 'audio.webm',
                    audio_content,
                    audio.content_type or 'audio/webm'
                )
            }
            
            response = await client.post(
                f"{STT_SERVICE_URL}/transcribe",
                files=files
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"STT service error: {response.text}"
                )
            
            result = response.json()
        
        # Add our own timing
        total_ms = int((time.time() - start_time) * 1000)
        result['api_total_ms'] = total_ms
        
        return result
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="STT service timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="STT service unavailable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


def _extract_text_from_delta(delta: dict) -> str:
    """Extract text content from a streaming delta, handling both string and array formats."""
    content = delta.get("content")
    
    # String content (simple case)
    if isinstance(content, str):
        return content
    
    # Array content (extended thinking / content blocks)
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if not isinstance(part, dict):
                continue
            # Only extract text type, skip thinking/reasoning
            if part.get("type") == "text" and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
        return "".join(text_parts)
    
    return ""


async def _stream_chat_sse(request: ChatRequest, start_time: float, agent_id: str, session_id: str):
    """Generator for SSE streaming chat responses.
    
    Emits events:
    - event: avatar - Avatar commands (mood/animation) extracted early from stream
    - data: {"content": "..."} - Streaming text chunks (tags stripped)
    - data: {"done": true, ...} - Final event with metadata
    """
    import json as json_module

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "model": "clawdbot",
                "messages": [
                    {"role": "user", "content": request.message}
                ],
                "stream": True,
                "stream_options": {"include_usage": True},
                "user": session_id
            }

            headers = {
                "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                "Content-Type": "application/json",
                "x-clawdbot-agent-id": agent_id
            }

            async with client.stream(
                "POST",
                f"{CLAWDBOT_URL}/v1/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield f"data: {json_module.dumps({'error': f'Brain error: {error_text.decode()}'})}\n\n"
                    return

                full_content = ""
                model_name = "unknown"
                usage_data = None
                avatar_event_sent = False
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            # Parse avatar commands from full content
                            clean_content, moods, animations = extract_avatar_commands(full_content)
                            
                            # Send final event with metadata
                            processing_ms = int((time.time() - start_time) * 1000)
                            final_event = {
                                "done": True,
                                "response": clean_content,
                                "agent_id": agent_id,
                                "processing_ms": processing_ms,
                                "model": model_name,
                            }
                            
                            # Include avatar commands if present
                            if moods:
                                final_event["moods"] = moods
                            if animations:
                                final_event["animations"] = animations
                            if usage_data:
                                final_event["usage"] = usage_data
                                
                            yield f"data: {json_module.dumps(final_event)}\n\n"
                            break
                        try:
                            chunk = json_module.loads(data_str)
                            
                            # Extract model name from first chunk
                            if chunk.get("model"):
                                model_name = chunk.get("model")
                            
                            # Extract usage if present (some providers send at end)
                            if chunk.get("usage"):
                                usage_data = chunk.get("usage")
                            
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = _extract_text_from_delta(delta)
                                if content:
                                    full_content += content
                                    
                                    # Check for avatar commands early and send them as soon as detected
                                    # This allows the frontend to start the expression change immediately
                                    if not avatar_event_sent:
                                        _, early_moods, early_animations = extract_avatar_commands(full_content)
                                        if early_moods or early_animations:
                                            avatar_data = {}
                                            if early_moods:
                                                # Send the first/primary mood
                                                avatar_data["mood"] = early_moods[0]["mood"]
                                                avatar_data["intensity"] = early_moods[0]["intensity"]
                                            if early_animations:
                                                avatar_data["animation"] = early_animations[0]
                                            yield f"event: avatar\ndata: {json_module.dumps(avatar_data)}\n\n"
                                            avatar_event_sent = True
                                    
                                    # Strip avatar tags from content before sending to frontend
                                    clean_chunk, _, _ = extract_avatar_commands(content)
                                    if clean_chunk:
                                        yield f"data: {json_module.dumps({'content': clean_chunk})}\n\n"
                        except json_module.JSONDecodeError:
                            continue
    except httpx.TimeoutException:
        yield f"data: {json_module.dumps({'error': 'Brain service timeout'})}\n\n"
    except httpx.ConnectError:
        yield f"data: {json_module.dumps({'error': 'Brain service unavailable'})}\n\n"
    except Exception as e:
        yield f"data: {json_module.dumps({'error': f'Chat failed: {str(e)}'})}\n\n"


@app.post("/api/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0, description="Enable SSE streaming (1=enabled, 0=disabled)"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_avatar_id: Optional[str] = Header(None, alias="X-Avatar-Id")
):
    """
    Send message to Clawdbot Brain and get response

    Body: {
        "message": "user message",
        "session_id": "user-123" (optional)
    }

    Query params:
        stream: 1 to enable SSE streaming, 0 for regular JSON response

    Returns (non-streaming): {
        "response": "agent reply",
        "agent_id": "main",
        "processing_ms": 1234
    }

    Returns (streaming): SSE events with chunks: {"content": "..."} and final: {"done": true, ...}
    """
    start_time = time.time()
    
    if not x_user_id or not x_avatar_id:
        raise HTTPException(status_code=400, detail="X-User-Id and X-Avatar-Id headers are required")

    user = get_user(x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar = get_avatar(x_avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    if avatar.get("owner") != x_user_id:
        raise HTTPException(status_code=403, detail="Avatar does not belong to user")

    agent_id = avatar.get("agent_id")
    if not agent_id or agent_id not in ALLOWED_CLAWDBOT_AGENT_IDS:
        raise HTTPException(status_code=400, detail="Invalid avatar agent id")

    # Get managed session from users.json
    session_id = get_user_session(x_user_id, x_avatar_id)
    if not session_id:
        raise HTTPException(status_code=500, detail="Failed to get or create session")

    # Streaming mode
    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(request, start_time, agent_id, session_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming mode (original behavior)
    try:
        # Call Clawdbot HTTP API
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": "clawdbot",
                "messages": [
                    {"role": "user", "content": request.message}
                ],
                "stream": False,
                "user": session_id
            }

            headers = {
                "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                "Content-Type": "application/json",
                "x-clawdbot-agent-id": agent_id
            }

            response = await client.post(
                f"{CLAWDBOT_URL}/v1/chat/completions",
                headers=headers,
                json=payload
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Brain error: {response.text}"
                )

            result = response.json()

        parsed = parse_chat_completion(result)
        response_text = parsed["response_text"]
        reasoning = parsed["reasoning"]
        thinking = parsed["thinking"]
        moods = parsed.get("moods", [])
        animations = parsed.get("animations", [])

        processing_ms = int((time.time() - start_time) * 1000)

        # Build enhanced response
        response_data = {
            "response": response_text,
            "agent_id": agent_id,
            "processing_ms": processing_ms,
            "model": result.get("model", "unknown"),
            "finish_reason": (result.get("choices") or [{}])[0].get("finish_reason", "unknown"),
        }

        # Include reasoning/thinking if present
        if reasoning:
            response_data["reasoning"] = reasoning
        if thinking:
            response_data["thinking"] = thinking
            
        # Include avatar commands if present
        if moods:
            response_data["moods"] = moods
        if animations:
            response_data["animations"] = animations

        # Include usage stats if present
        if "usage" in result:
            response_data["usage"] = result["usage"]

        # Include raw for debugging (can be removed in production)
        response_data["raw"] = result

        return response_data

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Brain service timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Brain service unavailable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.get("/api/sessions/list")
async def list_sessions(
    token: str = Depends(verify_token),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id")
):
    """List sessions for the current user.

    Filters to only show sessions defined in users.json for this user.
    """
    if not x_user_id:
        raise HTTPException(status_code=400, detail="X-User-Id header is required")

    # Get user's allowed sessions from users.json
    user_sessions = get_user_sessions(x_user_id)
    if not user_sessions:
        return {"sessions": [], "count": 0}
    
    # Get set of session IDs this user can see (filter out None/null)
    allowed_session_ids = {sid for sid in user_sessions.values() if sid}
    
    # If no valid sessions, return empty
    if not allowed_session_ids:
        return {"sessions": [], "count": 0}
    
    AGENTS_DIR = Path(os.getenv("CLAWDBOT_AGENTS_DIR", "/home/tbach/.clawdbot/agents"))
    out = []
    
    for agent_id in ALLOWED_CLAWDBOT_AGENT_IDS:
        sessions_file = AGENTS_DIR / agent_id / "sessions" / "sessions.json"
        if not sessions_file.exists():
            continue
        
        try:
            with open(sessions_file) as f:
                sessions_data = json.load(f)
            
            for key, s in sessions_data.items():
                # Format display name: agent:emilia-thai:openai-user:X -> X
                display_id = key
                if "openai-user:" in key:
                    display_id = key.split("openai-user:", 1)[1]
                
                # Only include if this session is in user's allowed list
                if display_id not in allowed_session_ids:
                    continue
                
                out.append({
                    "session_key": key,
                    "display_id": display_id,
                    "updated_at": s.get("updatedAt"),
                    "model": s.get("model"),
                    "agent_id": agent_id,
                    "session_id": s.get("sessionId"),
                })
        except Exception as e:
            print(f"Error reading sessions for {agent_id}: {e}")
            continue
    
    # Sort by updated_at descending
    out.sort(key=lambda x: x.get("updated_at") or 0, reverse=True)
    
    return {"sessions": out, "count": len(out)}


@app.post("/api/sessions/create")
async def create_session(
    request: CreateSessionRequest,
    token: str = Depends(verify_token),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_avatar_id: Optional[str] = Header(None, alias="X-Avatar-Id")
):
    """Create a new session for user+avatar.
    
    Updates users.json with the new session ID and returns it.
    Optional name in request body for custom session name.
    """
    if not x_user_id or not x_avatar_id:
        raise HTTPException(status_code=400, detail="X-User-Id and X-Avatar-Id headers are required")

    user = get_user(x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar = get_avatar(x_avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")

    if avatar.get("owner") != x_user_id:
        raise HTTPException(status_code=403, detail="Avatar does not belong to user")

    # Create new session and save to users.json
    session_id = create_new_session(x_user_id, x_avatar_id, request.name)
    if not session_id:
        raise HTTPException(status_code=500, detail="Failed to create session")

    return {
        "session_id": session_id,
        "user_id": x_user_id,
        "avatar_id": x_avatar_id,
        "agent_id": avatar.get("agent_id")
    }


def _extract_text_content(content: Any) -> str:
    """Extract text from message content (handles string and array formats)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                text_parts.append(part.get("text", ""))
            elif isinstance(part, str):
                text_parts.append(part)
        return "".join(text_parts)
    return ""


@app.get("/api/sessions/history/{session_id:path}")
async def get_session_history(
    session_id: str,
    token: str = Depends(verify_token),
    limit: int = Query(50, ge=1, le=200)
):
    """Get chat history for a session.
    
    Reads directly from JSONL session files on disk since
    sandboxed agents' sessions aren't accessible via gateway.
    """
    AGENTS_DIR = Path(os.getenv("CLAWDBOT_AGENTS_DIR", "/home/tbach/.clawdbot/agents"))
    
    # Find the session in any allowed agent's sessions.json
    session_uuid = None
    agent_id = None
    session_key = None
    
    for aid in ALLOWED_CLAWDBOT_AGENT_IDS:
        sessions_file = AGENTS_DIR / aid / "sessions" / "sessions.json"
        if not sessions_file.exists():
            continue
        
        try:
            with open(sessions_file) as f:
                sessions_data = json.load(f)
            
            for key, info in sessions_data.items():
                # Match by display_id (the part after openai-user:) or full key
                display_id = key.split("openai-user:", 1)[1] if "openai-user:" in key else key
                if session_id == display_id or session_id == key:
                    session_uuid = info.get("sessionId")
                    agent_id = aid
                    session_key = key
                    break
        except Exception:
            continue
        
        if session_uuid:
            break
    
    if not session_uuid:
        return {"messages": [], "session_id": session_id, "error": "Session not found"}
    
    # Read the JSONL file
    jsonl_file = AGENTS_DIR / agent_id / "sessions" / f"{session_uuid}.jsonl"
    if not jsonl_file.exists():
        return {"messages": [], "session_id": session_id, "error": "Session file not found"}
    
    try:
        messages = []
        with open(jsonl_file) as f:
            for line in f:
                if not line.strip():
                    continue
                entry = json.loads(line)
                
                # Only process message entries
                if entry.get("type") != "message":
                    continue
                
                msg = entry.get("message", {})
                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue
                
                # Extract text content
                raw_content = msg.get("content", "")
                text_content = _extract_text_content(raw_content)
                
                # Strip mood/animation tags for assistant messages
                if role == "assistant":
                    text_content, _, _ = extract_avatar_commands(text_content)
                
                # Skip empty messages
                if not text_content.strip():
                    continue
                
                messages.append({
                    "role": role,
                    "content": text_content,
                    "timestamp": entry.get("timestamp")
                })
        
        # Return last N messages
        if len(messages) > limit:
            messages = messages[-limit:]
        
        return {"messages": messages, "session_id": session_id, "session_key": session_key}
    
    except Exception as e:
        return {"messages": [], "session_id": session_id, "error": str(e)}


@app.get("/api/voices")
async def get_voices(token: str = Depends(verify_token)):
    """Get list of available TTS voices."""
    voices = [{"key": key, **value} for key, value in VOICE_OPTIONS.items()]
    return {"voices": voices, "default": "rachel"}


async def elevenlabs_websocket_tts(text: str, voice_id: str) -> dict:
    """
    Generate TTS via ElevenLabs WebSocket API with character-level timestamps.
    
    Returns: {
        "audio": bytes,
        "alignment": {
            "chars": ["H", "e", "l", "l", "o"],
            "charStartTimesMs": [0, 50, 100, 150, 200],
            "charDurationsMs": [50, 50, 50, 50, 100]
        }
    }
    """
    ws_url = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={ELEVENLABS_MODEL}"
    
    audio_chunks = []
    alignment_data = None
    
    try:
        async with websockets.connect(
            ws_url,
            additional_headers={"xi-api-key": ELEVENLABS_API_KEY},
            close_timeout=5
        ) as ws:
            # Send initial configuration with alignment enabled
            init_message = {
                "text": " ",  # Initial space to start the stream
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                },
                "generation_config": {
                    "chunk_length_schedule": [120, 160, 250, 290]
                },
                "xi_api_key": ELEVENLABS_API_KEY
            }
            await ws.send(json.dumps(init_message))
            
            # Send the actual text with alignment
            text_message = {
                "text": text,
                "try_trigger_generation": True,
                "flush": True
            }
            await ws.send(json.dumps(text_message))
            
            # Send empty string to signal end of input
            await ws.send(json.dumps({"text": ""}))
            
            # Receive audio chunks and alignment data
            async for message in ws:
                try:
                    data = json.loads(message)
                    
                    # Audio chunk (base64 encoded)
                    if "audio" in data and data["audio"]:
                        audio_bytes = base64.b64decode(data["audio"])
                        if audio_bytes:  # Skip empty chunks
                            audio_chunks.append(audio_bytes)
                    
                    # Alignment/timing data
                    if "alignment" in data and data["alignment"]:
                        alignment_data = data["alignment"]
                    
                    # Normalized alignment format (some API versions use this)
                    if "normalizedAlignment" in data and data["normalizedAlignment"]:
                        alignment_data = data["normalizedAlignment"]
                    
                    # Check if stream is done
                    if data.get("isFinal"):
                        break
                        
                except json.JSONDecodeError:
                    continue
        
        # Combine all audio chunks
        full_audio = b"".join(audio_chunks)
        
        return {
            "audio": full_audio,
            "alignment": alignment_data
        }
        
    except Exception as e:
        print(f"WebSocket TTS error: {e}")
        raise


async def elevenlabs_rest_tts(text: str, voice_id: str) -> bytes:
    """
    Fallback: Generate TTS via ElevenLabs REST API (no timestamps).
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "text": text,
                "model_id": ELEVENLABS_MODEL,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
        )
        
        if response.status_code != 200:
            raise Exception(f"ElevenLabs API error: {response.text}")
        
        return response.content


@app.post("/api/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    x_avatar_id: Optional[str] = Header(None, alias="X-Avatar-Id")
):
    """
    Convert text to speech via ElevenLabs with optional lip sync data.
    
    Body: {
        "text": "Hello, how are you?",
        "voice_id": "rachel" (optional, key from /api/voices)
    }
    
    Headers:
        X-Avatar-Id: Avatar ID to use for voice selection (optional)
    
    Returns: {
        "audio": "base64-encoded-mp3",
        "alignment": {...} or null,
        "has_lip_sync": true/false,
        "processing_ms": 123
    }
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")
    
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    
    # Determine voice ID - priority: request.voice_id > avatar config > default
    voice_id = ELEVENLABS_VOICE_ID  # default
    
    # Check avatar config for voice_id
    if x_avatar_id:
        avatar = get_avatar(x_avatar_id)
        if avatar and avatar.get("voice_id"):
            voice_id = avatar["voice_id"]
    
    # Request voice_id overrides avatar config
    if request.voice_id and request.voice_id in VOICE_OPTIONS:
        voice_id = VOICE_OPTIONS[request.voice_id]["id"]
    
    start_time = time.time()
    
    audio_bytes = None
    alignment_data = None
    has_lip_sync = False
    
    # Try WebSocket API first (with alignment)
    try:
        result = await elevenlabs_websocket_tts(request.text, voice_id)
        audio_bytes = result["audio"]
        alignment_data = result.get("alignment")
        has_lip_sync = alignment_data is not None
        print(f"WebSocket TTS: got {len(audio_bytes)} bytes, alignment: {has_lip_sync}")
    except Exception as ws_error:
        print(f"WebSocket TTS failed, falling back to REST: {ws_error}")
        
        # Fallback to REST API (no alignment)
        try:
            audio_bytes = await elevenlabs_rest_tts(request.text, voice_id)
            has_lip_sync = False
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="ElevenLabs service timeout")
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="ElevenLabs service unavailable")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
    
    processing_ms = int((time.time() - start_time) * 1000)
    
    # Log timing for debugging
    print(f"TTS generated in {processing_ms}ms for {len(request.text)} chars, lip_sync={has_lip_sync}")
    
    # Encode audio as base64 for JSON response
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    
    return JSONResponse(
        content={
            "audio_base64": audio_b64,
            "alignment": alignment_data,
            "has_lip_sync": has_lip_sync,
            "processing_ms": processing_ms,
            "text_length": len(request.text)
        },
        headers={
            "X-Processing-Time-Ms": str(processing_ms),
            "X-Text-Length": str(len(request.text)),
            "X-Has-Lip-Sync": str(has_lip_sync).lower()
        }
    )


@app.get("/api/memory")
async def get_main_memory(
    token: str = Depends(verify_token)
):
    """
    Get contents of MEMORY.md
    
    Returns: Plain text content of MEMORY.md
    """
    try:
        if not MEMORY_MD_PATH.exists():
            raise HTTPException(status_code=404, detail="MEMORY.md not found")
        
        content = MEMORY_MD_PATH.read_text(encoding='utf-8')
        
        return PlainTextResponse(
            content=content,
            headers={
                "X-File-Path": str(MEMORY_MD_PATH),
                "X-File-Size": str(MEMORY_MD_PATH.stat().st_size),
                "X-Modified": datetime.fromtimestamp(MEMORY_MD_PATH.stat().st_mtime).isoformat()
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read MEMORY.md: {str(e)}")


@app.get("/api/memory/list")
async def list_memory_files(
    token: str = Depends(verify_token)
):
    """
    List all memory/*.md files
    
    Returns: {
        "files": ["2026-01-30.md", "2026-01-29.md", ...],
        "count": 10
    }
    """
    try:
        if not MEMORY_DIR_PATH.exists():
            return {"files": [], "count": 0}
        
        # Get all .md files in memory directory
        md_files = sorted(
            [f.name for f in MEMORY_DIR_PATH.glob("*.md")],
            reverse=True  # Most recent first
        )
        
        return {
            "files": md_files,
            "count": len(md_files),
            "directory": str(MEMORY_DIR_PATH)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list memory files: {str(e)}")


@app.get("/api/memory/{filename}")
async def get_memory_file(
    filename: str,
    token: str = Depends(verify_token)
):
    """
    Get contents of a specific memory file
    
    Params:
        filename: e.g., "2026-01-30.md"
    
    Returns: Plain text content of the file
    """
    # Security: ensure filename is safe (only .md files, no path traversal)
    if not filename.endswith('.md') or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    try:
        file_path = MEMORY_DIR_PATH / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
        content = file_path.read_text(encoding='utf-8')
        
        return PlainTextResponse(
            content=content,
            headers={
                "X-File-Path": str(file_path),
                "X-File-Size": str(file_path.stat().st_size),
                "X-Modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {filename}: {str(e)}")


@app.post("/api/memory")
async def update_main_memory(
    request: MemoryUpdateRequest,
    token: str = Depends(verify_token)
):
    """
    Update MEMORY.md content - DISABLED for security (read-only mode)
    """
    raise HTTPException(
        status_code=403,
        detail="Memory editing is disabled for security. Memory is read-only."
    )


@app.post("/api/memory/{filename}")
async def update_memory_file(
    filename: str,
    request: MemoryUpdateRequest,
    token: str = Depends(verify_token)
):
    """
    Update a specific memory file - DISABLED for security (read-only mode)
    """
    raise HTTPException(
        status_code=403,
        detail="Memory editing is disabled for security. Memory is read-only."
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Emilia Web App API",
        "version": "3.3.0",
        "endpoints": {
            "health": "/api/health",
            "users_list": "GET /api/users (auth optional)",
            "user_detail": "GET /api/users/{user_id} (auth optional)",
            "user_select_avatar": "POST /api/users/{user_id}/select-avatar/{avatar_id} (auth optional)",
            "transcribe": "POST /api/transcribe (requires auth)",
            "chat": "POST /api/chat (auth optional, requires X-User-Id + X-Avatar-Id headers)",
            "speak": "POST /api/speak (requires auth)",
            "memory_get": "GET /api/memory (requires auth)",
            "memory_update": "POST /api/memory (requires auth) [DISABLED: returns 403]",
            "memory_list": "GET /api/memory/list (requires auth)",
            "memory_file_get": "GET /api/memory/{filename} (requires auth)",
            "memory_file_update": "POST /api/memory/{filename} (requires auth) [DISABLED: returns 403]",
            "sessions_list": "GET /api/sessions/list (requires auth)",
            "sessions_history": "GET /api/sessions/history/{session_id} (requires auth)"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )
