"""FastAPI dependencies for request validation and authentication."""
from pathlib import Path
from fastapi import Depends, Header, HTTPException, Query
from config import settings
from db.repositories import UserRepository, AgentRepository


async def verify_token(authorization: str | None = Header(None)) -> str:
    """Verify Bearer token from Authorization header."""
    if not settings.auth_token:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != settings.auth_token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


async def get_user_id(x_user_id: str = Header(..., alias="X-User-Id")) -> str:
    """Extract and validate X-User-Id header."""
    return x_user_id.strip()


async def get_agent_id(x_agent_id: str = Header(..., alias="X-Agent-Id")) -> str:
    """Extract and validate X-Agent-Id header."""
    return x_agent_id.strip()


async def get_optional_agent_id(
    x_agent_id: str | None = Header(None, alias="X-Agent-Id")
) -> str | None:
    """Extract optional X-Agent-Id header."""
    return x_agent_id.strip() if x_agent_id else None


async def get_session_id(
    x_session_id: str | None = Header(None, alias="X-Session-Id")
) -> str | None:
    """Extract optional X-Session-Id header."""
    return x_session_id.strip() if x_session_id else None


async def get_agent_workspace(
    user_id: str = Depends(get_user_id),
    agent_id: str = Query(..., description="Agent ID"),
) -> Path:
    """Validate user access to agent and return workspace path.

    Used by memory routes to avoid repeating access/workspace checks.
    """
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")
    workspace = agent.get("workspace")
    if not workspace:
        raise HTTPException(status_code=404, detail="Agent workspace not configured")
    return Path(workspace)


async def ensure_games_v2_enabled_for_agent(
    agent_id: str = Depends(get_agent_id),
) -> None:
    """Gate game V2 routes for selected rollout agents."""
    if not settings.is_games_v2_enabled_for_agent(agent_id):
        raise HTTPException(status_code=404, detail="Games V2 is disabled for this agent")
