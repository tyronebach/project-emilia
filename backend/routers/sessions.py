"""Session routes"""
import logging
from fastapi import APIRouter, Depends, Query
from dependencies import verify_token, get_user_id, get_optional_agent_id
from core.exceptions import not_found, forbidden
from schemas import (
    CreateSessionRequest, UpdateSessionRequest,
    SessionsListResponse, SessionHistoryResponse, DeleteResponse
)
from db.repositories import UserRepository, SessionRepository, MessageRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=SessionsListResponse)
async def list_sessions(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")

    sessions = SessionRepository.get_for_user(user_id, agent_id)
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.post("")
async def create_session(
    request: CreateSessionRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")
    if not UserRepository.can_access_agent(user_id, request.agent_id):
        raise forbidden("User cannot access this agent")

    return SessionRepository.create(request.agent_id, user_id, request.name)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise not_found("Session")
    return session


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    return SessionRepository.update(session_id, request.name)


@router.delete("/{session_id}", response_model=DeleteResponse)
async def delete_session(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    success = SessionRepository.delete(session_id)
    if not success:
        raise not_found("Session")
    return DeleteResponse(deleted=1)


@router.get("/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    limit: int = Query(50, ge=1, le=200),
    include_runtime: bool = Query(False, alias="includeRuntime"),
):
    """Get chat history for a session from SQLite."""
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    messages = MessageRepository.get_by_session(
        session_id,
        limit=limit,
        include_game_runtime=include_runtime,
    )
    return {
        "messages": [
            {
                "role": m["role"],
                "origin": m.get("origin"),
                "content": m["content"],
                "timestamp": m["timestamp"],
            }
            for m in messages
        ],
        "session_id": session_id,
        "count": len(messages),
    }
