#!/usr/bin/env python3
"""
Emilia Web App - Backend API
SQLite database for users, agents, sessions
Integrates with Clawdbot Brain for AI responses
"""
import os
import time
import httpx
import base64
import json
import asyncio
import websockets
from typing import Optional, Any
from pydantic import BaseModel
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from parse_chat import parse_chat_completion, extract_avatar_commands
import database as db


# ============ CONFIGURATION ============

STT_SERVICE_URL = os.getenv("STT_SERVICE_URL", "http://192.168.88.252:8765")
CLAWDBOT_URL = os.getenv("CLAWDBOT_URL", "http://127.0.0.1:18789")
CLAWDBOT_TOKEN = os.getenv("CLAWDBOT_TOKEN")
CLAWDBOT_AGENT_ID = os.getenv("CLAWDBOT_AGENT_ID")

AUTH_ALLOW_DEV_TOKEN = os.getenv("AUTH_ALLOW_DEV_TOKEN", "0") == "1"
AUTH_TOKEN = os.getenv("AUTH_TOKEN") or ("emilia-dev-token-2026" if AUTH_ALLOW_DEV_TOKEN else None)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

if not CLAWDBOT_TOKEN:
    raise RuntimeError("Missing CLAWDBOT_TOKEN env var")

# TTS Configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")

# Memory Configuration
EMILIA_WORKSPACE = os.getenv("EMILIA_WORKSPACE", "/home/tbach/clawd-emilia")
MEMORY_MD_PATH = Path(EMILIA_WORKSPACE) / "MEMORY.md"
AGENTS_DIR = Path(os.getenv("CLAWDBOT_AGENTS_DIR", "/home/tbach/.clawdbot/agents"))


# ============ REQUEST MODELS ============

class ChatRequest(BaseModel):
    message: str

class CreateSessionRequest(BaseModel):
    agent_id: str
    name: Optional[str] = None

class UpdateSessionRequest(BaseModel):
    name: Optional[str] = None

class SpeakRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


# ============ APP SETUP ============

app = FastAPI(title="Emilia API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ AUTH ============

def verify_token(authorization: str = Header(None)) -> str:
    if not AUTH_TOKEN:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


# ============ HEALTH ============

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ============ USER ROUTES ============

@app.get("/api/users")
async def list_users(token: str = Depends(verify_token)):
    """List all users"""
    users = db.get_users()
    return {"users": users, "count": len(users)}


@app.get("/api/users/{user_id}")
async def get_user(user_id: str, token: str = Depends(verify_token)):
    """Get user with their accessible agents"""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    agents = db.get_user_agents(user_id)
    return {
        **user,
        "agents": agents
    }


@app.get("/api/users/{user_id}/agents")
async def get_user_agents(user_id: str, token: str = Depends(verify_token)):
    """Get agents accessible to user"""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    agents = db.get_user_agents(user_id)
    return {"agents": agents, "count": len(agents)}


@app.get("/api/users/{user_id}/agents/{agent_id}/sessions")
async def get_user_agent_sessions(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Get user's sessions for a specific agent"""
    if not db.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not db.user_can_access_agent(user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")
    
    sessions = db.get_user_sessions(user_id, agent_id)
    return {"sessions": sessions, "count": len(sessions)}


# ============ AGENT ROUTES ============

@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str, token: str = Depends(verify_token)):
    """Get agent details"""
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    owners = db.get_agent_owners(agent_id)
    return {
        **agent,
        "owners": [o["id"] for o in owners]
    }


# ============ SESSION ROUTES ============

@app.get("/api/sessions")
async def list_sessions(
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id")
):
    """List sessions for user, optionally filtered by agent"""
    if not db.get_user(x_user_id):
        raise HTTPException(status_code=404, detail="User not found")
    
    sessions = db.get_user_sessions(x_user_id, x_agent_id)
    return {"sessions": sessions, "count": len(sessions)}


@app.post("/api/sessions")
async def create_session(
    request: CreateSessionRequest,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id")
):
    """Create a new session"""
    if not db.get_user(x_user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not db.user_can_access_agent(x_user_id, request.agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")
    
    session = db.create_session(request.agent_id, x_user_id, request.name)
    return session


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str, token: str = Depends(verify_token)):
    """Get session details"""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id")
):
    """Update session name"""
    if not db.user_can_access_session(x_user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")
    
    session = db.update_session(session_id, request.name)
    return session


@app.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: str,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id")
):
    """Delete a session"""
    if not db.user_can_access_session(x_user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")
    
    success = db.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@app.get("/api/sessions/{session_id}/history")
async def get_session_history(
    session_id: str,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id"),
    limit: int = Query(50, ge=1, le=200)
):
    """Get chat history for a session from Clawdbot's JSONL files"""
    if not db.user_can_access_session(x_user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")
    
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = db.get_agent(session["agent_id"])
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    clawdbot_agent_id = agent["clawdbot_agent_id"]
    
    # Find session in Clawdbot's sessions.json to get the JSONL file UUID
    sessions_file = AGENTS_DIR / clawdbot_agent_id / "sessions" / "sessions.json"
    if not sessions_file.exists():
        return {"messages": [], "session_id": session_id}
    
    try:
        with open(sessions_file) as f:
            sessions_data = json.load(f)
        
        # Look for session by checking display_id matches
        jsonl_uuid = None
        for key, info in sessions_data.items():
            display_id = key.split("openai-user:")[-1] if "openai-user:" in key else key
            if display_id == session_id:
                jsonl_uuid = info.get("sessionId")
                break
        
        if not jsonl_uuid:
            return {"messages": [], "session_id": session_id}
        
        # Read the JSONL file
        jsonl_file = AGENTS_DIR / clawdbot_agent_id / "sessions" / f"{jsonl_uuid}.jsonl"
        if not jsonl_file.exists():
            return {"messages": [], "session_id": session_id}
        
        messages = []
        with open(jsonl_file) as f:
            for line in f:
                if not line.strip():
                    continue
                entry = json.loads(line)
                
                if entry.get("type") != "message":
                    continue
                
                msg = entry.get("message", {})
                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue
                
                raw_content = msg.get("content", "")
                text_content = _extract_text_content(raw_content)
                
                if role == "assistant":
                    text_content, _, _ = extract_avatar_commands(text_content)
                
                if not text_content.strip():
                    continue
                
                messages.append({
                    "role": role,
                    "content": text_content,
                    "timestamp": entry.get("timestamp")
                })
        
        return {
            "messages": messages[-limit:],
            "session_id": session_id,
            "count": len(messages)
        }
        
    except Exception as e:
        print(f"Error reading history: {e}")
        return {"messages": [], "session_id": session_id, "error": str(e)}


def _extract_text_content(content: Any) -> str:
    """Extract text from message content"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content)


# ============ CHAT ============

@app.post("/api/chat")
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
    
    # Update session last_used
    db.update_session_last_used(session_id)
    db.increment_session_message_count(session_id)
    
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
                "model": "clawdbot",
                "messages": [{"role": "user", "content": request.message}],
                "stream": False,
                "user": session_id
            }
            
            response = await client.post(
                f"{CLAWDBOT_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                    "Content-Type": "application/json",
                    "x-clawdbot-agent-id": clawdbot_agent_id
                },
                json=payload
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            
            result = response.json()
        
        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)
        
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
                "model": "clawdbot",
                "messages": [{"role": "user", "content": request.message}],
                "stream": True,
                "stream_options": {"include_usage": True},
                "user": session_id
            }
            
            async with client.stream(
                "POST",
                f"{CLAWDBOT_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                    "Content-Type": "application/json",
                    "x-clawdbot-agent-id": clawdbot_agent_id
                },
                json=payload
            ) as response:
                if response.status_code != 200:
                    yield f"data: {json.dumps({'error': 'API error'})}\n\n"
                    return
                
                full_content = ""
                moods = []
                animations = []
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
                            clean_chunk, chunk_moods, chunk_anims = extract_avatar_commands(chunk)
                            
                            if chunk_moods:
                                moods.extend(chunk_moods)
                                for m in chunk_moods:
                                    yield f"event: avatar\ndata: {json.dumps({'mood': m['mood'], 'intensity': m['intensity']})}\n\n"
                            
                            if chunk_anims:
                                animations.extend(chunk_anims)
                                for a in chunk_anims:
                                    yield f"event: avatar\ndata: {json.dumps({'animation': a})}\n\n"
                            
                            if clean_chunk:
                                yield f"data: {json.dumps({'content': clean_chunk})}\n\n"
                        
                        if choices[0].get("finish_reason"):
                            break
                            
                    except json.JSONDecodeError:
                        continue
                
                # Final response
                clean_full, _, _ = extract_avatar_commands(full_content)
                processing_ms = int((time.time() - start_time) * 1000)
                
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


# ============ TRANSCRIBE ============

@app.post("/api/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    token: str = Depends(verify_token)
):
    """Transcribe audio via STT service"""
    try:
        audio_data = await audio.read()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{STT_SERVICE_URL}/transcribe",
                files={"audio": (audio.filename or "audio.webm", audio_data, audio.content_type)}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="STT failed")
            
            return response.json()
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="STT timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="STT unavailable")


# ============ TTS ============

@app.post("/api/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id")
):
    """Text-to-speech via ElevenLabs"""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured")
    
    voice_id = request.voice_id or ELEVENLABS_VOICE_ID
    
    # Get agent-specific voice if available
    if x_agent_id:
        agent = db.get_agent(x_agent_id)
        if agent and agent.get("voice_id"):
            voice_id = agent["voice_id"]
    
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    
    ws_url = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={ELEVENLABS_MODEL}&output_format=mp3_44100_128"
    
    try:
        audio_chunks = []
        alignment_data = None
        
        async with websockets.connect(
            ws_url,
            extra_headers={"xi-api-key": ELEVENLABS_API_KEY}
        ) as ws:
            # Send initial config
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                "generation_config": {"chunk_length_schedule": [120, 160, 250, 290]},
                "xi_api_key": ELEVENLABS_API_KEY
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
                        alignment_data = data["alignment"]
                    
                    if data.get("isFinal"):
                        break
                        
                except asyncio.TimeoutError:
                    break
        
        if not audio_chunks:
            raise HTTPException(status_code=500, detail="No audio generated")
        
        audio_bytes = b"".join(audio_chunks)
        audio_base64 = base64.b64encode(audio_bytes).decode()
        
        return {
            "audio_base64": audio_base64,
            "alignment": alignment_data,
            "voice_id": voice_id,
            "duration_estimate": len(audio_bytes) / (44100 * 2 / 8)
        }
        
    except websockets.exceptions.WebSocketException as e:
        raise HTTPException(status_code=503, detail=f"TTS WebSocket error: {e}")


# ============ MEMORY ============

@app.get("/api/memory")
async def get_memory(token: str = Depends(verify_token)):
    """Get agent's MEMORY.md content"""
    if not MEMORY_MD_PATH.exists():
        raise HTTPException(status_code=404, detail="Memory file not found")
    
    content = MEMORY_MD_PATH.read_text(encoding="utf-8")
    return PlainTextResponse(content, media_type="text/markdown")


# ============ STARTUP ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
