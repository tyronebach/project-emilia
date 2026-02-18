"""User routes"""
import json
from fastapi import APIRouter, Depends
from dependencies import verify_token
from core.exceptions import not_found, forbidden, bad_request
from schemas import UsersListResponse, AgentsListResponse, RoomsListResponse, RoomResponse
from schemas.requests import UserPreferencesUpdate
from db.repositories import UserRepository, RoomRepository

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=UsersListResponse)
async def list_users(token: str = Depends(verify_token)):
    users = UserRepository.get_all_with_agent_count()
    return UsersListResponse(users=users, count=len(users))


@router.get("/{user_id}")
async def get_user(user_id: str, token: str = Depends(verify_token)):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    agents = UserRepository.get_agents(user_id)
    return {**user, "agents": agents}


@router.patch("/{user_id}/preferences")
async def update_user_preferences(
    user_id: str,
    update: UserPreferencesUpdate,
    token: str = Depends(verify_token)
):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    existing = {}
    try:
        existing = json.loads(user.get("preferences") or "{}")
    except json.JSONDecodeError:
        existing = {}

    if not isinstance(existing, dict):
        existing = {}

    merged = {**existing, **update.preferences}
    updated = UserRepository.update_preferences(user_id, json.dumps(merged))
    if not updated:
        raise bad_request("Failed to update preferences")

    agents = UserRepository.get_agents(user_id)
    return {**updated, "agents": agents}


@router.get("/{user_id}/agents", response_model=AgentsListResponse)
async def get_user_agents(user_id: str, token: str = Depends(verify_token)):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    agents = UserRepository.get_agents(user_id)
    return AgentsListResponse(agents=agents, count=len(agents))


@router.get("/{user_id}/agents/{agent_id}/sessions", response_model=SessionsListResponse)
async def get_user_agent_rooms(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Get rooms for a user-agent pair."""
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    rooms = RoomRepository.get_for_user(user_id)
    # Filter to rooms that include this agent
    filtered = [r for r in rooms if any(
        a.get("agent_id") == agent_id
        for a in (RoomRepository.get_agents(r["id"]) or [])
    )]
    return RoomsListResponse(rooms=[RoomResponse(**r) for r in filtered], count=len(filtered))
