"""
FastAPI dependencies for request validation and authentication.
"""
from fastapi import Header, HTTPException
from typing import Annotated
from config import settings


async def verify_token(authorization: str | None = Header(None)) -> str:
    """
    Verify Bearer token from Authorization header.

    Args:
        authorization: Authorization header value

    Returns:
        Valid token string

    Raises:
        HTTPException: 401 if token is missing or invalid, 500 if server not configured
    """
    if not settings.auth_token:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != settings.auth_token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


async def get_user_id(x_user_id: str | None = Header(None, alias="X-User-Id")) -> str:
    """
    Extract and validate X-User-Id header.

    Args:
        x_user_id: User ID from header

    Returns:
        User ID string

    Raises:
        HTTPException: 400 if header is missing or empty
    """
    if not x_user_id or not x_user_id.strip():
        raise HTTPException(status_code=400, detail="X-User-Id header required")
    return x_user_id.strip()


async def get_agent_id(x_agent_id: str | None = Header(None, alias="X-Agent-Id")) -> str:
    """
    Extract and validate X-Agent-Id header.

    Args:
        x_agent_id: Agent ID from header

    Returns:
        Agent ID string

    Raises:
        HTTPException: 400 if header is missing or empty
    """
    if not x_agent_id or not x_agent_id.strip():
        raise HTTPException(status_code=400, detail="X-Agent-Id header required")
    return x_agent_id.strip()


async def get_optional_agent_id(
    x_agent_id: str | None = Header(None, alias="X-Agent-Id")
) -> str | None:
    """
    Extract optional X-Agent-Id header.

    Args:
        x_agent_id: Agent ID from header (optional)

    Returns:
        Agent ID string or None
    """
    return x_agent_id.strip() if x_agent_id else None


async def get_session_id(
    x_session_id: str | None = Header(None, alias="X-Session-Id")
) -> str | None:
    """
    Extract optional X-Session-Id header.

    Args:
        x_session_id: Session ID from header (optional)

    Returns:
        Session ID string or None
    """
    return x_session_id.strip() if x_session_id else None


# Type aliases for cleaner route signatures
AuthToken = Annotated[str, Header(None)]
UserId = Annotated[str, Header(None, alias="X-User-Id")]
AgentId = Annotated[str, Header(None, alias="X-Agent-Id")]
OptionalAgentId = Annotated[str | None, Header(None, alias="X-Agent-Id")]
SessionId = Annotated[str | None, Header(None, alias="X-Session-Id")]
