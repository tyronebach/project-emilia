"""Admin/manage routes"""
from fastapi import APIRouter, Depends
from dependencies import verify_token
from core.exceptions import not_found
from db.repositories import AgentRepository, SessionRepository
from schemas import (
    AgentUpdate, AgentsListResponse, SessionsListResponse,
    AgentDeleteResponse, DeleteResponse, StatusResponse
)

router = APIRouter(prefix="/api/manage", tags=["admin"])


@router.get("/sessions", response_model=SessionsListResponse)
async def list_all_sessions(token: str = Depends(verify_token)):
    sessions = SessionRepository.get_all()
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.delete("/sessions/agent/{agent_id}", response_model=AgentDeleteResponse)
async def delete_agent_sessions(agent_id: str, token: str = Depends(verify_token)):
    count = SessionRepository.delete_by_agent(agent_id)
    return AgentDeleteResponse(deleted=count, agent_id=agent_id)


@router.delete("/sessions/all", response_model=DeleteResponse)
async def delete_all_sessions(token: str = Depends(verify_token)):
    count = SessionRepository.delete_all()
    return DeleteResponse(deleted=count)


@router.get("/agents", response_model=AgentsListResponse)
async def get_manage_agents(token: str = Depends(verify_token)):
    agents = AgentRepository.get_all()
    return AgentsListResponse(agents=agents, count=len(agents))


@router.put("/agents/{agent_id}", response_model=StatusResponse)
async def update_manage_agent(
    agent_id: str,
    update: AgentUpdate,
    token: str = Depends(verify_token)
):
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    AgentRepository.update(agent_id, update.model_dump(exclude_unset=True))
    return StatusResponse(status="ok", agent_id=agent_id)
