"""Agent routes"""
from fastapi import APIRouter, HTTPException, Depends, Header
from dependencies import verify_token
import database as db

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    token: str = Depends(verify_token),
    x_user_id: str = Header(..., alias="X-User-Id")
):
    """Get agent details"""
    if not db.user_can_access_agent(x_user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    owners = db.get_agent_owners(agent_id)
    return {
        **agent,
        "owners": [o["id"] for o in owners]
    }
