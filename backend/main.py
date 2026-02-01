#!/usr/bin/env python3
"""
Emilia Web App - Backend API
Proxies audio to STT service and manages sessions
Integrates with Clawdbot Brain for AI responses
"""
import os
import time
import httpx
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, PlainTextResponse, StreamingResponse


from parse_chat import parse_chat_completion, extract_avatar_commands


# Configuration
STT_SERVICE_URL = os.getenv("STT_SERVICE_URL", "http://192.168.88.252:8765")
CLAWDBOT_URL = os.getenv("CLAWDBOT_URL", "http://127.0.0.1:18789")

# Secrets MUST come from the environment (no hardcoded defaults).
# This prevents accidental leakage + makes misconfigurations obvious.
CLAWDBOT_TOKEN = os.getenv("CLAWDBOT_TOKEN")

# IMPORTANT SECURITY NOTE:
# This waifu app must NEVER be able to route to other Clawdbot agents (e.g. "main"/Beatrice).
# Defaulting to "main" is a foot-gun: any missing/mis-set env var would leak requests to Beatrice.
# We therefore default to "emilia" and we FAIL CLOSED if the agent id is anything else.
CLAWDBOT_AGENT_ID = os.getenv("CLAWDBOT_AGENT_ID", "emilia")

# Auth token: allow an explicit dev default only when AUTH_ALLOW_DEV_TOKEN=1.
AUTH_ALLOW_DEV_TOKEN = os.getenv("AUTH_ALLOW_DEV_TOKEN", "0") == "1"
AUTH_TOKEN = os.getenv("AUTH_TOKEN") or ("emilia-dev-token-2026" if AUTH_ALLOW_DEV_TOKEN else None)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")

if not CLAWDBOT_TOKEN:
    raise RuntimeError("Missing CLAWDBOT_TOKEN env var (required)")
if not AUTH_TOKEN:
    raise RuntimeError(
        "Missing AUTH_TOKEN env var (required). "
        "For local dev only you may set AUTH_ALLOW_DEV_TOKEN=1 to use the default dev token."
    )

ALLOWED_CLAWDBOT_AGENT_IDS = {"emilia"}
if CLAWDBOT_AGENT_ID not in ALLOWED_CLAWDBOT_AGENT_IDS:
    raise RuntimeError(
        f"Invalid CLAWDBOT_AGENT_ID={CLAWDBOT_AGENT_ID!r}. "
        f"This app must be locked to {sorted(ALLOWED_CLAWDBOT_AGENT_IDS)}."
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
    allow_headers=["Authorization", "Content-Type"],
)


def verify_token(authorization: Optional[str] = Header(None)):
    """Simple token-based auth"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
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
            "info": brain_info
        }
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


async def _stream_chat_sse(request: ChatRequest, start_time: float):
    """Generator for SSE streaming chat responses."""
    import json as json_module

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "model": "clawdbot",
                "messages": [
                    {"role": "user", "content": request.message}
                ],
                "stream": True,
                "user": request.session_id
            }

            headers = {
                "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                "Content-Type": "application/json",
                "x-clawdbot-agent-id": CLAWDBOT_AGENT_ID
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
                                "agent_id": CLAWDBOT_AGENT_ID,
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
                                    yield f"data: {json_module.dumps({'content': content})}\n\n"
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
    stream: int = Query(0, description="Enable SSE streaming (1=enabled, 0=disabled)")
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

    # Streaming mode
    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(request, start_time),
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
                "user": request.session_id
            }

            headers = {
                "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                "Content-Type": "application/json",
                "x-clawdbot-agent-id": CLAWDBOT_AGENT_ID
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
            "agent_id": CLAWDBOT_AGENT_ID,
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
async def list_sessions(token: str = Depends(verify_token)):
    """List recent Emilia sessions.

    Implementation uses Gateway tool invocation: POST {CLAWDBOT_URL}/tools/invoke with tool=sessions_list.
    If the gateway doesn't allow the tool (policy) or auth differs, we fail soft and return an empty list.
    """

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{CLAWDBOT_URL}/tools/invoke",
                headers={
                    "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "tool": "sessions_list",
                    "action": "json",
                    "args": {"limit": 50, "messageLimit": 0},
                    "sessionKey": "main",
                },
            )

        if resp.status_code != 200:
            return {"sessions": [], "count": 0, "error": f"gateway:{resp.status_code}"}

        payload = resp.json() or {}
        result = payload.get("result") or {}
        sessions = result.get("sessions") or []

        out = []
        for s in sessions:
            key = s.get("key") or ""
            if not key.startswith("agent:emilia:"):
                continue
            # typical: agent:emilia:openai-user:web-user-<ts>
            display_id = key
            if "web-user-" in key:
                display_id = key.split("web-user-", 1)[1]
                display_id = "web-user-" + display_id
            out.append(
                {
                    "session_key": key,
                    "display_id": display_id,
                    "updated_at": s.get("updatedAt"),
                    "model": s.get("model"),
                }
            )

        return {"sessions": out, "count": len(out)}

    except Exception as e:
        return {"sessions": [], "count": 0, "error": str(e)}


@app.get("/api/voices")
async def get_voices(token: str = Depends(verify_token)):
    """Get list of available TTS voices."""
    voices = [{"key": key, **value} for key, value in VOICE_OPTIONS.items()]
    return {"voices": voices, "default": "rachel"}


@app.post("/api/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token)
):
    """
    Convert text to speech via ElevenLabs
    
    Body: {
        "text": "Hello, how are you?",
        "voice_id": "rachel" (optional, key from /api/voices)
    }
    
    Returns: audio/mpeg (MP3 stream)
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")
    
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    
    # Determine voice ID
    voice_id = ELEVENLABS_VOICE_ID  # default
    if request.voice_id and request.voice_id in VOICE_OPTIONS:
        voice_id = VOICE_OPTIONS[request.voice_id]["id"]
    
    start_time = time.time()
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "text": request.text,
                    "model_id": ELEVENLABS_MODEL,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75
                    }
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"ElevenLabs API error: {response.text}"
                )
            
            processing_ms = int((time.time() - start_time) * 1000)
            
            # Log timing for debugging
            print(f"TTS generated in {processing_ms}ms for {len(request.text)} chars")
            
            return Response(
                content=response.content,
                media_type="audio/mpeg",
                headers={
                    "X-Processing-Time-Ms": str(processing_ms),
                    "X-Text-Length": str(len(request.text))
                }
            )
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="ElevenLabs service timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="ElevenLabs service unavailable")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


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
        "version": "3.2.0",
        "endpoints": {
            "health": "/api/health",
            "transcribe": "POST /api/transcribe (requires auth)",
            "chat": "POST /api/chat (requires auth)",
            "speak": "POST /api/speak (requires auth)",
            "memory_get": "GET /api/memory (requires auth)",
            "memory_update": "POST /api/memory (requires auth) [DISABLED: returns 403]",
            "memory_list": "GET /api/memory/list (requires auth)",
            "memory_file_get": "GET /api/memory/{filename} (requires auth)",
            "memory_file_update": "POST /api/memory/{filename} (requires auth) [DISABLED: returns 403]",
            "sessions_list": "GET /api/sessions/list (requires auth)"
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
