"""Memory file routes"""
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse
from dependencies import verify_token, get_agent_workspace
from schemas import MemoryFilesResponse, MemoryContentResponse

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def get_memory(
    token: str = Depends(verify_token),
    workspace: Path = Depends(get_agent_workspace),
):
    """Get agent's MEMORY.md content"""
    memory_path = workspace / "MEMORY.md"
    if not memory_path.exists():
        raise HTTPException(status_code=404, detail="Memory file not found")

    content = memory_path.read_text(encoding="utf-8")
    return PlainTextResponse(content, media_type="text/markdown")


@router.get("/list", response_model=MemoryFilesResponse)
async def list_memory_files(
    token: str = Depends(verify_token),
    workspace: Path = Depends(get_agent_workspace),
):
    """List available memory files (MEMORY.md + daily files)"""
    files = []

    memory_md = workspace / "MEMORY.md"
    if memory_md.exists():
        files.append("MEMORY.md")

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
    workspace: Path = Depends(get_agent_workspace),
):
    """Get specific memory file content"""
    # Handle MEMORY.md specially
    if filename == "MEMORY.md":
        memory_path = workspace / "MEMORY.md"
        if not memory_path.exists():
            raise HTTPException(status_code=404, detail="Memory file not found")
        content = memory_path.read_text(encoding="utf-8")
        return MemoryContentResponse(filename=filename, content=content)

    # Daily files are in memory/ directory
    base_dir = (workspace / "memory").resolve()
    file_path = (workspace / "memory" / filename).resolve()

    # Security check - prevent path traversal
    if not file_path.is_relative_to(base_dir):
        raise HTTPException(status_code=403, detail="Access denied")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Memory file not found")

    content = file_path.read_text(encoding="utf-8")
    return MemoryContentResponse(filename=filename, content=content)
