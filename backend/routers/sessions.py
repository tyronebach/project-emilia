"""Session routes"""
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from dependencies import verify_token, get_user_id, get_optional_agent_id
from core.exceptions import not_found, forbidden, bad_request
from schemas import (
    CreateSessionRequest, UpdateSessionRequest,
    SessionsListResponse, SessionHistoryResponse, DeleteResponse
)
from db.repositories import UserRepository, SessionRepository, MessageRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# --- Request/Response Models for Multi-Agent ---

class CreateMultiAgentSessionRequest(BaseModel):
    agent_ids: list[str]
    name: Optional[str] = None


class AddAgentRequest(BaseModel):
    agent_id: str


class AgentListResponse(BaseModel):
    agents: list[dict]
    count: int


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
    """Create a session with a single agent (backwards compatible)."""
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")
    if not UserRepository.can_access_agent(user_id, request.agent_id):
        raise forbidden("User cannot access this agent")

    return SessionRepository.create(request.agent_id, user_id, request.name)


@router.post("/multi")
async def create_multi_agent_session(
    request: CreateMultiAgentSessionRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    """Create a session with multiple agents."""
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")

    if not request.agent_ids:
        raise bad_request("At least one agent_id required")

    # Verify user can access all agents
    for agent_id in request.agent_ids:
        if not UserRepository.can_access_agent(user_id, agent_id):
            raise forbidden(f"User cannot access agent {agent_id}")

    return SessionRepository.create(
        agent_id=None,
        user_id=user_id,
        name=request.name,
        agent_ids=request.agent_ids
    )


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
                "agent_id": m.get("agent_id"),  # Multi-agent support
            }
            for m in messages
        ],
        "session_id": session_id,
        "count": len(messages),
    }


# --- Multi-Agent Management ---

@router.get("/{session_id}/agents", response_model=AgentListResponse)
async def get_session_agents(
    session_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    """Get all agents in a session."""
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    agents = SessionRepository.get_agents(session_id)
    return AgentListResponse(agents=agents, count=len(agents))


@router.post("/{session_id}/agents")
async def add_agent_to_session(
    session_id: str,
    request: AddAgentRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    """Add an agent to a session."""
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    if not UserRepository.can_access_agent(user_id, request.agent_id):
        raise forbidden("User cannot access this agent")

    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise not_found("Session")

    added = SessionRepository.add_agent(session_id, request.agent_id)
    if not added:
        raise bad_request("Agent already in session")

    return SessionRepository.get_by_id(session_id)


@router.delete("/{session_id}/agents/{agent_id}")
async def remove_agent_from_session(
    session_id: str,
    agent_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
):
    """Remove an agent from a session."""
    if not SessionRepository.user_can_access(user_id, session_id):
        raise forbidden("Cannot access this session")

    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise not_found("Session")

    removed = SessionRepository.remove_agent(session_id, agent_id)
    if not removed:
        raise bad_request("Cannot remove agent (last agent or not in session)")

    return SessionRepository.get_by_id(session_id)
