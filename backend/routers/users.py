"""User routes"""
import json
from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from schemas import UsersListResponse, AgentsListResponse, SessionsListResponse
from schemas.requests import UserPreferencesUpdate
import database as db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=UsersListResponse)
async def list_users(token: str = Depends(verify_token)):
    """List all users with their agent counts"""
    users = db.get_users()
    # Add avatar_count (really agent count) for each user
    enriched_users = []
    for user in users:
        agents = db.get_user_agents(user["id"])
        enriched_users.append({
            **user,
            "avatar_count": len(agents)
        })
    return UsersListResponse(users=enriched_users, count=len(enriched_users))


@router.get("/{user_id}")
async def get_user(user_id: str, token: str = Depends(verify_token)):
    """Get user with their accessible agents"""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    agents = db.get_user_agents(user_id)
    return {
        **user,
        "agents": agents
    }


@router.patch("/{user_id}/preferences")
async def update_user_preferences(
    user_id: str,
    update: UserPreferencesUpdate,
    token: str = Depends(verify_token)
):
    """Update user preferences (merged into existing JSON)."""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = {}
    try:
        existing = json.loads(user.get("preferences") or "{}")
    except json.JSONDecodeError:
        existing = {}

    if not isinstance(existing, dict):
        existing = {}

    merged = {**existing, **update.preferences}
    updated = db.update_user_preferences(user_id, json.dumps(merged))
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update preferences")

    agents = db.get_user_agents(user_id)
    return {
        **updated,
        "agents": agents
    }


@router.get("/{user_id}/agents", response_model=AgentsListResponse)
async def get_user_agents(user_id: str, token: str = Depends(verify_token)):
    """Get agents accessible to user"""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    agents = db.get_user_agents(user_id)
    return AgentsListResponse(agents=agents, count=len(agents))


@router.get("/{user_id}/agents/{agent_id}/sessions", response_model=SessionsListResponse)
async def get_user_agent_sessions(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Get user's sessions for a specific agent"""
    if not db.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not db.user_can_access_agent(user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    sessions = db.get_user_sessions(user_id, agent_id)
    return SessionsListResponse(sessions=sessions, count=len(sessions))
