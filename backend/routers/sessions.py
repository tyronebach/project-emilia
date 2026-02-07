"""Session routes"""
import json
import logging
from typing import Any
from fastapi import APIRouter, HTTPException, Depends, Query
from dependencies import verify_token, get_user_id, get_optional_agent_id
from schemas import (
    CreateSessionRequest, UpdateSessionRequest,
    SessionsListResponse, SessionHistoryResponse, DeleteResponse
)
from config import settings
from parse_chat import extract_avatar_commands
from db.repositories import UserRepository, AgentRepository, SessionRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=SessionsListResponse)
async def list_sessions(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    if not UserRepository.get_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")

    sessions = SessionRepository.get_for_user(user_id, agent_id)
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.post("")
async def create_session(
    request: CreateSessionRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not UserRepository.get_by_id(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not UserRepository.can_access_agent(user_id, request.agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    return SessionRepository.create(request.agent_id, user_id, request.name)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")

    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")

    return SessionRepository.update(session_id, request.name)


@router.delete("/{session_id}", response_model=DeleteResponse)
async def delete_session(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise HTTPException(status_code=403, detail="Cannot access this session")

    success = SessionRepository.delete(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return DeleteResponse(deleted=1)


@router.get("/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    limit: int = Query(50, ge=1, le=200)
):
    """Get chat history for a session from Clawdbot's JSONL files"""
    empty = {"messages": [], "session_id": session_id, "count": 0}

    if not SessionRepository.user_can_access(user_id, session_id):
        return empty

    session = SessionRepository.get_by_id(session_id)
    if not session:
        return empty

    agent = AgentRepository.get_by_id(session["agent_id"])
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    clawdbot_agent_id = agent["clawdbot_agent_id"]

    sessions_file = settings.clawdbot_agents_dir / clawdbot_agent_id / "sessions" / "sessions.json"
    if not sessions_file.exists():
        return empty

    try:
        with open(sessions_file) as f:
            sessions_data = json.load(f)

        jsonl_uuid = None
        for key, info in sessions_data.items():
            display_id = key.split("openai-user:")[-1] if "openai-user:" in key else key
            if display_id == session_id:
                jsonl_uuid = info.get("sessionId")
                break

        if not jsonl_uuid:
            return empty

        jsonl_file = settings.clawdbot_agents_dir / clawdbot_agent_id / "sessions" / f"{jsonl_uuid}.jsonl"
        if not jsonl_file.exists():
            return empty

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
                    text_content, _ = extract_avatar_commands(text_content)

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

    except Exception:
        logger.exception("Error reading session history for %s", session_id)
        return empty


def _extract_text_content(content: Any) -> str:
    """Extract text from message content"""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content)
