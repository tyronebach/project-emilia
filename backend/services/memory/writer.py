"""Workspace-backed memory file writer with DB indexing."""
from __future__ import annotations

import re
from pathlib import Path

from services.memory import indexer
from services.memory.reader import read

_VALID_MEMORY_PATH_WRITE = re.compile(r"^(?:MEMORY\.md|memory/\d{4}-\d{2}-\d{2}\.md)$")


def validate_memory_write_path(path: str) -> bool:
    return bool(_VALID_MEMORY_PATH_WRITE.match(path or ""))


async def write(
    workspace: str | Path | None,
    path: str,
    content: str,
    mode: str = "append",
    *,
    agent_id: str,
    user_id: str | None,
) -> str:
    if not workspace:
        return "Error: no workspace configured for this agent"
    if not validate_memory_write_path(path):
        return (
            f"Error: invalid memory path '{path}' "
            "(must be MEMORY.md or memory/YYYY-MM-DD.md, e.g. memory/2026-02-12.md)"
        )

    file_path = Path(workspace) / path
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if mode == "overwrite":
            file_path.write_text(content, encoding="utf-8")
        else:
            with file_path.open("a", encoding="utf-8") as handle:
                handle.write(content)
        full_text = read(workspace, path, truncate=False)
        if full_text.startswith("Error:"):
            return full_text
        await indexer.index_document(agent_id=agent_id, user_id=user_id, path=path, content=full_text)
        return f"OK: wrote {len(content)} chars to {path} (mode={mode})"
    except Exception:
        return f"Error: could not write to {path}"
