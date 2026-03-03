"""Memory file routes"""
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from core.exceptions import not_found, forbidden
from dependencies import verify_token, get_agent_workspace, get_user_id
from db.repositories import AgentRepository
from schemas import MemoryFilesResponse, MemoryContentResponse
from services.memory import reader, search

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def get_memory(
    token: str = Depends(verify_token),
    workspace: Path = Depends(get_agent_workspace),
):
    """Get agent's MEMORY.md content"""
    content = reader.read(workspace, "MEMORY.md", truncate=False)
    if content.startswith("Error:"):
        raise not_found("Memory file")
    return PlainTextResponse(content, media_type="text/markdown")


@router.get("/list", response_model=MemoryFilesResponse)
async def list_memory_files(
    token: str = Depends(verify_token),
    workspace: Path = Depends(get_agent_workspace),
):
    """List available memory files (MEMORY.md + daily files)"""
    return MemoryFilesResponse(workspace=str(workspace), files=reader.list_files(workspace))


@router.get("/search")
async def search_memory(
    q: str = Query(..., min_length=1, description="Search query"),
    agent_id: str = Query(..., description="Agent ID"),
    limit: int = Query(5, ge=1, le=20),
    token: str = Depends(verify_token),
    user_id: str = Depends(get_user_id),
    workspace: Path = Depends(get_agent_workspace),
):
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    results = await search.search(
        query=q,
        agent_id=agent_id,
        user_id=user_id,
        workspace=workspace,
        limit=limit,
    )
    return {"results": results, "count": len(results)}


@router.get("/{filename:path}", response_model=MemoryContentResponse)
async def get_memory_file(
    filename: str,
    token: str = Depends(verify_token),
    workspace: Path = Depends(get_agent_workspace),
):
    """Get specific memory file content"""
    normalized = filename if filename == "MEMORY.md" else f"memory/{filename}"
    if not reader.validate_memory_path(normalized):
        raise forbidden()
    content = reader.read(workspace, normalized, truncate=False)
    if content.startswith("Error: file not found"):
        raise not_found("Memory file")
    if content.startswith("Error:"):
        raise forbidden()
    return MemoryContentResponse(filename=filename, content=content)
