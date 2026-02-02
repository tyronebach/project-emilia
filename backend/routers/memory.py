"""Memory file routes"""
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import PlainTextResponse
from dependencies import verify_token
from schemas import MemoryFilesResponse, MemoryContentResponse
import database as db

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def get_memory(
    token: str = Depends(verify_token),
    agent_id: str = Query(..., description="Agent ID to get memory for")
):
    """Get agent's MEMORY.md content"""
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.get("workspace"):
        raise HTTPException(status_code=404, detail="Agent workspace not configured")

    workspace = Path(agent["workspace"])
    memory_path = workspace / "MEMORY.md"

    if not memory_path.exists():
        raise HTTPException(status_code=404, detail="Memory file not found")

    content = memory_path.read_text(encoding="utf-8")
    return PlainTextResponse(content, media_type="text/markdown")


@router.get("/list", response_model=MemoryFilesResponse)
async def list_memory_files(
    token: str = Depends(verify_token),
    agent_id: str = Query(..., description="Agent ID to list memory files for")
):
    """List available memory files (MEMORY.md + daily files) for specific agent"""
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.get("workspace"):
        raise HTTPException(status_code=404, detail="Agent workspace not configured")

    workspace = Path(agent["workspace"])
    files = []

    # Add MEMORY.md if exists
    memory_md = workspace / "MEMORY.md"
    if memory_md.exists():
        files.append("MEMORY.md")

    # Add daily files from memory/ directory
    memory_dir = workspace / "memory"
    if memory_dir.exists() and memory_dir.is_dir():
        for f in memory_dir.iterdir():
            if f.is_file() and f.suffix == ".md":
                files.append(f.name)

    return MemoryFilesResponse(workspace=str(workspace), files=files)


@router.get("/{filename:path}", response_model=MemoryContentResponse)
async def get_memory_file(
    filename: str,
    token: str = Depends(verify_token),
    agent_id: str = Query(..., description="Agent ID to get memory file for")
):
    """Get specific memory file content for specific agent"""
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.get("workspace"):
        raise HTTPException(status_code=404, detail="Agent workspace not configured")

    workspace = Path(agent["workspace"])

    # Handle MEMORY.md specially
    if filename == "MEMORY.md":
        memory_path = workspace / "MEMORY.md"
        if not memory_path.exists():
            raise HTTPException(status_code=404, detail="Memory file not found")
        content = memory_path.read_text(encoding="utf-8")
        return MemoryContentResponse(filename=filename, content=content)

    # Daily files are in memory/ directory
    file_path = workspace / "memory" / filename

    # Security check - prevent path traversal
    try:
        file_path = file_path.resolve()
        if not str(file_path).startswith(str((workspace / "memory").resolve())):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Memory file not found")

    content = file_path.read_text(encoding="utf-8")
    return MemoryContentResponse(filename=filename, content=content)
