"""Workspace-backed memory file readers."""
from __future__ import annotations

import re
from pathlib import Path

SNIPPET_MAX_CHARS = 700

_VALID_MEMORY_PATH_READ = re.compile(r"^(?:MEMORY\.md|memory/[\w. -]+\.md)$")


def validate_memory_path(path: str) -> bool:
    return bool(_VALID_MEMORY_PATH_READ.match(path or ""))


def list_files(workspace: str | Path | None) -> list[str]:
    if not workspace:
        return []
    root = Path(workspace)
    files: list[str] = []
    memory_md = root / "MEMORY.md"
    if memory_md.exists() and memory_md.is_file():
        files.append("MEMORY.md")

    memory_dir = root / "memory"
    if memory_dir.exists() and memory_dir.is_dir():
        for file_path in sorted(memory_dir.iterdir()):
            if file_path.is_file() and file_path.suffix == ".md":
                files.append(f"memory/{file_path.name}")
    return files


def read(
    workspace: str | Path | None,
    path: str,
    start_line: int | None = None,
    num_lines: int | None = None,
    truncate: bool = True,
) -> str:
    if not workspace:
        return "Error: no workspace configured for this agent"
    if not validate_memory_path(path):
        return f"Error: invalid memory path '{path}' (must be MEMORY.md or memory/*.md)"

    file_path = Path(workspace) / path
    if not file_path.exists() or not file_path.is_file():
        return f"Error: file not found: {path}"

    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception:
        return f"Error: could not read {path}"

    if start_line is not None or num_lines is not None:
        lines = text.splitlines(keepends=True)
        start = max(0, (start_line or 1) - 1)
        end = start + (num_lines or len(lines))
        text = "".join(lines[start:end])

    if truncate and len(text) > SNIPPET_MAX_CHARS:
        return text[:SNIPPET_MAX_CHARS] + "\n... (truncated)"
    return text
