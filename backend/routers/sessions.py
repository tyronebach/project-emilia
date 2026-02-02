"""Session routes"""
import json
from typing import Optional, Any
from fastapi import APIRouter, HTTPException, Depends, Query, Header
from dependencies import verify_token
from schemas import (
    CreateSessionRequest, UpdateSessionRequest,
    SessionsListResponse, SessionHistoryResponse, DeleteResponse
)
from config import settings
from parse_chat import extract_avatar_commands
import database as db

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=SessionsListResponse)
async def list_sessions(
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id")
):
    """List sessions for user, optionally filtered by agent"""
    if not db.get_user(x_user_id):
        raise HTTPException(status_code=404, detail="User not found")

    sessions = db.get_user_sessions(x_user_id, x_agent_id)
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.post("")
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


@router.get("/{session_id}")
async def get_session(session_id: str, token: str = Depends(verify_token)):
    """Get session details"""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
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


@router.delete("/{session_id}", response_model=DeleteResponse)
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
    return DeleteResponse(deleted=True)


@router.get("/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(
    session_id: str,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id"),
    limit: int = Query(50, ge=1, le=200)
):
    """Get chat history for a session from Clawdbot's JSONL files"""
    # Return empty messages if user can't access or session doesn't exist
    if not db.user_can_access_session(x_user_id, session_id):
        return {"messages": [], "session_id": session_id, "count": 0}

    session = db.get_session(session_id)
    if not session:
        return {"messages": [], "session_id": session_id, "count": 0}

    agent = db.get_agent(session["agent_id"])
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    clawdbot_agent_id = agent["clawdbot_agent_id"]

    # Find session in Clawdbot's sessions.json to get the JSONL file UUID
    sessions_file = settings.clawdbot_agents_dir / clawdbot_agent_id / "sessions" / "sessions.json"
    if not sessions_file.exists():
        return {"messages": [], "session_id": session_id, "count": 0}

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
            return {"messages": [], "session_id": session_id, "count": 0}

        # Read the JSONL file
        jsonl_file = settings.clawdbot_agents_dir / clawdbot_agent_id / "sessions" / f"{jsonl_uuid}.jsonl"
        if not jsonl_file.exists():
            return {"messages": [], "session_id": session_id, "count": 0}

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
        return {"messages": [], "session_id": session_id, "count": 0, "error": str(e)}


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
