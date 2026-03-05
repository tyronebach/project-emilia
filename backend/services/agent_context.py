"""Shared agent context loading helpers (SOUL canon, etc.)."""
from __future__ import annotations

from pathlib import Path

from services.soul_parser import extract_canon_text

MAX_SOUL_MD_CHARS = 50_000


def load_workspace_soul_md(workspace: str | None) -> str | None:
    """Best-effort SOUL.md loading from an agent workspace."""
    if not workspace:
        return None

    soul_path = Path(workspace) / "SOUL.md"
    if not soul_path.exists() or not soul_path.is_file():
        return None

    try:
        text = soul_path.read_text(encoding="utf-8").strip()
    except OSError:
        return None

    if not text:
        return None

    if len(text) > MAX_SOUL_MD_CHARS:
        return text[:MAX_SOUL_MD_CHARS].rstrip()
    return text


def load_canon_soul_md(workspace: str | None) -> str | None:
    """Best-effort Canon-only SOUL.md loading from an agent workspace."""
    soul_md = load_workspace_soul_md(workspace)
    if not soul_md:
        return None
    canon = extract_canon_text(soul_md)
    return canon[:MAX_SOUL_MD_CHARS].rstrip() if canon else None
