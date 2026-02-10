"""Public game catalog routes."""
from fastapi import APIRouter, Depends
from dependencies import verify_token, get_user_id, get_agent_id
from core.exceptions import forbidden, not_found
from db.repositories import UserRepository, GameRepository
from schemas import GameCatalogResponse, GameCatalogItemResponse

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("/catalog", response_model=GameCatalogResponse)
async def list_game_catalog(
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    games = GameRepository.list_effective_games_for_agent(agent_id)
    return GameCatalogResponse(agent_id=agent_id, games=games, count=len(games))


@router.get("/catalog/{game_id}", response_model=GameCatalogItemResponse)
async def get_game_catalog_item(
    game_id: str,
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
):
    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    game = GameRepository.get_effective_game_for_agent(agent_id, game_id)
    if not game:
        raise not_found("Game")

    return game
