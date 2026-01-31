#!/usr/bin/env python3
"""
Emilia Web App - Backend API
Proxies audio to STT service and manages sessions
Integrates with Clawdbot Brain for AI responses
"""
import os
import time
import httpx
from typing import Optional, List
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, PlainTextResponse

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


@app.post("/api/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token)
):
    """
    Send message to Clawdbot Brain and get response
    
    Body: {
        "message": "user message",
        "session_id": "user-123" (optional)
    }
    
    Returns: {
        "response": "agent reply",
        "agent_id": "main",
        "processing_ms": 1234
    }
    """
    start_time = time.time()
    
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
        
        # Extract response text and metadata
        response_text = ""
        reasoning = None
        thinking = None
        
        if "choices" in result and len(result["choices"]) > 0:
            message = result["choices"][0].get("message", {})
            response_text = message.get("content", "")
            
            # Extract reasoning/thinking if present (extended thinking from GPT-5/Claude)
            if "reasoning" in message:
                reasoning = message["reasoning"]
            if "thinking" in message:
                thinking = message["thinking"]
        
        processing_ms = int((time.time() - start_time) * 1000)
        
        # Build enhanced response
        response_data = {
            "response": response_text,
            "agent_id": CLAWDBOT_AGENT_ID,
            "processing_ms": processing_ms,
            "model": result.get("model", "unknown"),
            "finish_reason": result.get("choices", [{}])[0].get("finish_reason", "unknown"),
        }
        
        # Include reasoning/thinking if present
        if reasoning:
            response_data["reasoning"] = reasoning
        if thinking:
            response_data["thinking"] = thinking
            
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


@app.get("/api/voices")
async def get_voices(token: str = Depends(verify_token)):
    """
    Get list of available TTS voices
    
    Returns: {
        "voices": [...],
        "default": "rachel"
    }
    """
    voices = [
        {"key": key, **value}
        for key, value in VOICE_OPTIONS.items()
    ]
    return {
        "voices": voices,
        "default": "rachel"
    }


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
            "memory_update": "POST /api/memory (requires auth)",
            "memory_list": "GET /api/memory/list (requires auth)",
            "memory_file_get": "GET /api/memory/{filename} (requires auth)",
            "memory_file_update": "POST /api/memory/{filename} (requires auth)"
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
