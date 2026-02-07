"""Agent routes"""
from fastapi import APIRouter, Depends
from dependencies import verify_token, get_user_id
from core.exceptions import not_found, forbidden
from db.repositories import UserRepository, AgentRepository

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id)
):
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")

    owners = AgentRepository.get_owners(agent_id)
    return {**agent, "owners": [o["id"] for o in owners]}
