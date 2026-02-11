"""User-facing Soul Window routes."""
from pathlib import Path

from fastapi import APIRouter, Depends, Query

from core.exceptions import bad_request, forbidden, not_found
from db.repositories import AgentRepository, UserRepository
from dependencies import get_agent_id, get_user_id, verify_token
from schemas import SoulWindowEventsRequest
from services.soul_window_service import (
    get_about_payload,
    get_bond_snapshot,
    get_mood_snapshot,
)
from services.workspace_events import WorkspaceEventsService

router = APIRouter(prefix="/api/soul-window", tags=["soul-window"])


def _resolve_agent_for_user(user_id: str, agent_id: str) -> dict:
    """Load agent and enforce user-agent access."""
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")
    return agent


def _require_workspace(agent: dict) -> Path:
    workspace_raw = agent.get("workspace")
    if not workspace_raw:
        raise not_found("Agent workspace")
    return Path(workspace_raw)


@router.get("/mood")
async def get_soul_mood(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    _resolve_agent_for_user(user_id, agent_id)
    return get_mood_snapshot(user_id, agent_id)


@router.get("/bond")
async def get_soul_bond(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    agent = _resolve_agent_for_user(user_id, agent_id)
    workspace = Path(agent["workspace"]) if agent.get("workspace") else None
    return get_bond_snapshot(user_id, agent_id, workspace=workspace)


@router.get("/about")
async def get_soul_about(
    include_raw: bool = Query(False, description="Include raw SOUL.md content in response"),
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    agent = _resolve_agent_for_user(user_id, agent_id)
    workspace = Path(agent["workspace"]) if agent.get("workspace") else None
    return get_about_payload(
        agent_id,
        display_name=agent.get("display_name") or agent_id,
        workspace=workspace,
        include_raw=include_raw,
    )


@router.get("/events")
async def get_soul_events(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    agent = _resolve_agent_for_user(user_id, agent_id)
    workspace = _require_workspace(agent)
    return WorkspaceEventsService.get_events(workspace, user_id, agent_id)


@router.post("/events")
async def mutate_soul_events(
    request: SoulWindowEventsRequest,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    agent = _resolve_agent_for_user(user_id, agent_id)
    workspace = _require_workspace(agent)

    try:
        if request.action == "add_milestone":
            if not request.item:
                raise bad_request("item is required for add_milestone")
            events = WorkspaceEventsService.add_milestone(workspace, user_id, agent_id, request.item)
        elif request.action == "add_event":
            if not request.item:
                raise bad_request("item is required for add_event")
            events = WorkspaceEventsService.add_event(workspace, user_id, agent_id, request.item)
        elif request.action == "remove_event":
            item_id = request.id or (
                str(request.item.get("id")).strip() if request.item and request.item.get("id") else ""
            )
            if not item_id:
                raise bad_request("id is required for remove_event")
            events = WorkspaceEventsService.remove_item(workspace, user_id, agent_id, item_id)
        else:
            raise bad_request("Unsupported action")
    except ValueError as exc:
        raise bad_request(str(exc)) from exc

    return {"ok": True, "events": events}
