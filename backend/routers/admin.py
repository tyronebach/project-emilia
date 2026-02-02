"""Admin/manage routes"""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from schemas import (
    AgentUpdate, AgentsListResponse, SessionsListResponse,
    AgentDeleteResponse, DeleteResponse, StatusResponse
)
import database as db

router = APIRouter(prefix="/api/manage", tags=["admin"])


@router.get("/sessions", response_model=SessionsListResponse)
async def list_all_sessions(token: str = Depends(verify_token)):
    """List all sessions (manage)"""
    sessions = db.get_all_sessions()
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.delete("/sessions/agent/{agent_id}", response_model=AgentDeleteResponse)
async def delete_agent_sessions(agent_id: str, token: str = Depends(verify_token)):
    """Delete all sessions for an agent (manage)"""
    count = db.delete_sessions_by_agent(agent_id)
    return AgentDeleteResponse(deleted=count, agent_id=agent_id)


@router.delete("/sessions/all", response_model=DeleteResponse)
async def delete_all_sessions(token: str = Depends(verify_token)):
    """Delete ALL sessions (manage) - use with caution"""
    all_sessions = db.get_all_sessions()
    count = 0
    for s in all_sessions:
        if db.delete_session(s['id']):
            count += 1
    return DeleteResponse(deleted=count)


@router.get("/agents", response_model=AgentsListResponse)
async def get_manage_agents(token: str = Depends(verify_token)):
    """Get all agents with their configuration from database"""
    agents = db.get_agents()
    return AgentsListResponse(agents=agents, count=len(agents))


@router.put("/agents/{agent_id}", response_model=StatusResponse)
async def update_manage_agent(
    agent_id: str,
    update: AgentUpdate,
    token: str = Depends(verify_token)
):
    """Update agent configuration in database"""
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent in database
    db.update_agent(agent_id, update.model_dump(exclude_unset=True))

    return StatusResponse(status="ok", agent_id=agent_id)
