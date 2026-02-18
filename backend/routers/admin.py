"""Admin/manage routes"""
import sqlite3
from fastapi import APIRouter, Depends
from dependencies import verify_token
from core.exceptions import not_found, bad_request
from db.repositories import AgentRepository, RoomRepository, RoomMessageRepository, UserRepository, GameRepository
from db.connection import get_db
from config import settings
from schemas import (
    AgentUpdate,
    AgentCreate,
    GameRegistryCreate,
    GameRegistryUpdate,
    AgentGameConfigUpdate,
    UserCreate,
    UserUpdate,
    UsersListResponse,
    UserAgentsResponse,
    UserResponse,
    AgentResponse,
    AgentsListResponse,
    RoomsListResponse,
    RoomResponse,
    GameRegistryListResponse,
    GameRegistryItemResponse,
    AgentGameConfigListResponse,
    AgentGameConfigResponse,
    AgentDeleteResponse,
    DeleteResponse,
    StatusResponse,
)

router = APIRouter(prefix="/api/manage", tags=["admin"])


@router.get("/rooms", response_model=RoomsListResponse)
async def list_all_rooms(token: str = Depends(verify_token)):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM rooms ORDER BY last_activity DESC").fetchall()
    return RoomsListResponse(rooms=[RoomResponse(**r) for r in rows], count=len(rows))


@router.delete("/rooms/all", response_model=DeleteResponse)
async def delete_all_rooms(token: str = Depends(verify_token)):
    with get_db() as conn:
        count = conn.execute("DELETE FROM rooms").rowcount
    return DeleteResponse(deleted=count)


@router.get("/users", response_model=UsersListResponse)
async def get_manage_users(token: str = Depends(verify_token)):
    users = UserRepository.get_all_with_agent_count()
    return UsersListResponse(users=users, count=len(users))


@router.post("/users", response_model=UserResponse)
async def create_manage_user(
    user: UserCreate,
    token: str = Depends(verify_token),
):
    try:
        created = UserRepository.create(user.id, user.display_name)
    except sqlite3.IntegrityError:
        raise bad_request("User already exists")
    return {**created, "avatar_count": 0}


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_manage_user(
    user_id: str,
    update: UserUpdate,
    token: str = Depends(verify_token),
):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    updates = {key: value for key, value in update.model_dump(exclude_unset=True).items() if value is not None}
    if not updates:
        raise bad_request("No updates provided")

    updated = UserRepository.update(user_id, updates)
    if not updated:
        raise bad_request("Failed to update user")
    return updated


@router.delete("/users/{user_id}", response_model=DeleteResponse)
async def delete_manage_user(
    user_id: str,
    token: str = Depends(verify_token),
):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    deleted = UserRepository.delete(user_id)
    return DeleteResponse(deleted=deleted)


@router.get("/agents", response_model=AgentsListResponse)
async def get_manage_agents(token: str = Depends(verify_token)):
    agents = AgentRepository.get_all()
    return AgentsListResponse(agents=agents, count=len(agents))


@router.post("/agents", response_model=AgentResponse)
async def create_manage_agent(
    agent: AgentCreate,
    token: str = Depends(verify_token),
):
    try:
        created = AgentRepository.create(
            agent_id=agent.id,
            display_name=agent.display_name,
            clawdbot_agent_id=agent.clawdbot_agent_id,
            vrm_model=agent.vrm_model or "emilia.vrm",
            voice_id=agent.voice_id,
            workspace=agent.workspace,
            chat_mode=agent.chat_mode,
            direct_model=agent.direct_model,
            direct_api_base=agent.direct_api_base,
        )
    except sqlite3.IntegrityError:
        raise bad_request("Agent already exists")
    return created


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


@router.delete("/agents/{agent_id}", response_model=AgentDeleteResponse)
async def delete_manage_agent(agent_id: str, token: str = Depends(verify_token)):
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    deleted = AgentRepository.delete(agent_id)
    return AgentDeleteResponse(deleted=deleted, agent_id=agent_id)


@router.get("/games", response_model=GameRegistryListResponse)
async def get_manage_games(
    token: str = Depends(verify_token),
):
    games = GameRepository.list_registry(include_inactive=True)
    return GameRegistryListResponse(games=games, count=len(games))


@router.post("/games", response_model=GameRegistryItemResponse)
async def create_manage_game(
    game: GameRegistryCreate,
    token: str = Depends(verify_token),
):
    existing = GameRepository.get_registry(game.id)
    if existing:
        raise bad_request("Game already exists")

    created = GameRepository.create_registry_game(
        game_id=game.id,
        display_name=game.display_name,
        category=game.category,
        description=game.description,
        module_key=game.module_key,
        active=game.active,
        move_provider_default=game.move_provider_default,
        rule_mode=game.rule_mode,
        prompt_instructions=game.prompt_instructions,
        version=game.version,
    )
    return created


@router.put("/games/{game_id}", response_model=StatusResponse)
async def update_manage_game(
    game_id: str,
    update: GameRegistryUpdate,
    token: str = Depends(verify_token),
):
    if not GameRepository.get_registry(game_id):
        raise not_found("Game")

    updates = update.model_dump(exclude_unset=True)
    if not updates:
        raise bad_request("No updates provided")

    GameRepository.update_registry_game(game_id, updates)
    return StatusResponse(status="ok", message="game_updated")


@router.delete("/games/{game_id}", response_model=StatusResponse)
async def delete_manage_game(
    game_id: str,
    token: str = Depends(verify_token),
):
    if not GameRepository.get_registry(game_id):
        raise not_found("Game")
    GameRepository.deactivate_registry_game(game_id)
    return StatusResponse(status="ok", message="game_deactivated")


@router.get("/agents/{agent_id}/games", response_model=AgentGameConfigListResponse)
async def get_manage_agent_games(
    agent_id: str,
    token: str = Depends(verify_token),
):
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")
    games = GameRepository.list_agent_game_configs(agent_id, include_inactive=True)
    return AgentGameConfigListResponse(agent_id=agent_id, games=games, count=len(games))


@router.put("/agents/{agent_id}/games/{game_id}", response_model=AgentGameConfigResponse)
async def upsert_manage_agent_game(
    agent_id: str,
    game_id: str,
    update: AgentGameConfigUpdate,
    token: str = Depends(verify_token),
):
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")
    if not GameRepository.get_registry(game_id):
        raise not_found("Game")

    payload = update.model_dump(exclude_unset=True)
    if not payload:
        raise bad_request("No updates provided")

    config = GameRepository.upsert_agent_game_config(
        agent_id=agent_id,
        game_id=game_id,
        enabled=payload.get("enabled"),
        mode=payload.get("mode"),
        difficulty=payload.get("difficulty"),
        prompt_override=payload.get("prompt_override"),
        workspace_required=payload.get("workspace_required"),
    )
    return config


@router.delete("/agents/{agent_id}/games/{game_id}", response_model=StatusResponse)
async def delete_manage_agent_game(
    agent_id: str,
    game_id: str,
    token: str = Depends(verify_token),
):
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")
    if not GameRepository.get_registry(game_id):
        raise not_found("Game")

    deleted = GameRepository.delete_agent_game_config(agent_id, game_id)
    if deleted:
        return StatusResponse(status="ok", message="game_config_deleted")
    return StatusResponse(status="ok", message="game_config_absent")


@router.get("/users/{user_id}/agents", response_model=UserAgentsResponse)
async def get_manage_user_agents(user_id: str, token: str = Depends(verify_token)):
    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    agents = UserRepository.get_agents(user_id)
    return UserAgentsResponse(agents=agents, count=len(agents))


@router.post("/users/{user_id}/agents/{agent_id}", response_model=StatusResponse)
async def add_manage_user_agent(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token),
):
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")

    UserRepository.add_agent_access(user_id, agent_id)
    return StatusResponse(status="ok", message="mapping_added")


@router.delete("/users/{user_id}/agents/{agent_id}", response_model=StatusResponse)
async def remove_manage_user_agent(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token),
):
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")

    UserRepository.remove_agent_access(user_id, agent_id)
    return StatusResponse(status="ok", message="mapping_removed")


@router.get("/debug/compaction/{room_id}")
async def get_compaction_debug(room_id: str, token: str = Depends(verify_token)):
    """Get compaction debug info for a room."""
    room = RoomRepository.get_by_id(room_id)
    if not room:
        raise not_found("Room")

    actual_count = RoomRepository.get_message_count(room_id)

    return {
        "room_id": room_id,
        "room_name": room.get("name"),
        "message_count_cached": room.get("message_count", 0),
        "message_count_actual": actual_count,
        "summary": room.get("summary"),
        "summary_length": len(room.get("summary") or ""),
        "summary_updated_at": room.get("summary_updated_at"),
        "compaction_count": room.get("compaction_count", 0),
        "config": {
            "threshold": settings.compact_threshold,
            "keep_recent": settings.compact_keep_recent,
            "model": settings.compact_model,
        },
        "should_compact": actual_count > settings.compact_threshold,
    }


@router.post("/debug/compaction/{room_id}/trigger")
async def trigger_compaction(room_id: str, token: str = Depends(verify_token)):
    """Manually trigger compaction for a room."""
    from services.compaction import CompactionService

    room = RoomRepository.get_by_id(room_id)
    if not room:
        raise not_found("Room")

    all_msgs = RoomMessageRepository.get_all_for_room(room_id)
    if len(all_msgs) <= settings.compact_keep_recent:
        return {
            "status": "skipped",
            "reason": f"Only {len(all_msgs)} messages, need more than {settings.compact_keep_recent} to compact"
        }

    split_at = len(all_msgs) - settings.compact_keep_recent
    old_msgs = all_msgs[:split_at]

    existing_summary = RoomRepository.get_summary(room_id)
    to_summarize = []
    if existing_summary:
        to_summarize.append({"role": "system", "content": f"Prior summary: {existing_summary}"})
    for msg in old_msgs:
        sender_name = str(msg.get("sender_name") or msg.get("sender_id") or "Unknown")
        content = str(msg.get("content") or "")
        to_summarize.append({"role": "user", "content": f"[{sender_name}]: {content}"})

    summary = await CompactionService.summarize_messages(to_summarize)

    RoomRepository.update_summary(room_id, summary)
    deleted = RoomMessageRepository.delete_oldest(room_id, settings.compact_keep_recent)

    return {
        "status": "ok",
        "messages_summarized": len(old_msgs),
        "messages_deleted": deleted,
        "summary_length": len(summary),
        "summary_preview": summary[:500] + "..." if len(summary) > 500 else summary,
    }
