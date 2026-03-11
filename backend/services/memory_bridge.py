"""Shared adapter around the standalone memory engine."""
from __future__ import annotations

from services.memory.reader import SNIPPET_MAX_CHARS, read, validate_memory_path as _validate_memory_path
from services.memory.search import search as standalone_search
from pathlib import Path

from services.memory.writer import validate_memory_write_path

MAX_SEARCH_RESULTS = 5
MIN_SEARCH_SCORE = 0.3


def _open_memory_db(*args, **kwargs):
    return None


async def _embed_query(*args, **kwargs):
    return None


def _vector_search(*args, **kwargs) -> list[dict]:
    raise NotImplementedError("Vector search is implemented in services.memory.search")


def _fts_search(*args, **kwargs) -> list[dict]:
    raise NotImplementedError("FTS search is implemented in services.memory.search")


def _hybrid_merge(vec_results: list[dict], fts_results: list[dict], limit: int, min_score: float) -> list[dict]:
    merged = {}
    for row in vec_results:
        merged[row["id"]] = {**row, "score": 0.7 * float(row.get("score") or 0.0)}
    for row in fts_results:
        if row["id"] in merged:
            merged[row["id"]]["score"] += 0.3 * float(row.get("score") or 0.0)
        else:
            merged[row["id"]] = {**row, "score": 0.3 * float(row.get("score") or 0.0)}
    results = sorted(merged.values(), key=lambda item: item["score"], reverse=True)
    return [
        {
            "path": item["path"],
            "snippet": str(item.get("text") or item.get("content") or "")[:SNIPPET_MAX_CHARS],
            "score": round(float(item["score"]), 4),
            "source": item.get("source", "memory"),
        }
        for item in results
        if float(item["score"]) >= min_score
    ][:limit]


async def search(
    claw_agent_id: str,
    query: str,
    limit: int = MAX_SEARCH_RESULTS,
    min_score: float = MIN_SEARCH_SCORE,
    *,
    user_id: str | None = None,
    workspace: str | None = None,
) -> list[dict]:
    return await standalone_search(
        query=query,
        agent_id=claw_agent_id,
        user_id=user_id,
        workspace=workspace,
        limit=limit,
        min_score=min_score,
    )


def write(
    workspace: str | None,
    path: str,
    content: str,
    mode: str = "append",
    *,
    agent_id: str = "compat-agent",
    user_id: str | None = None,
) -> str:
    del agent_id, user_id
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
        return f"OK: wrote {len(content)} chars to {path} (mode={mode})"
    except Exception:
        return f"Error: could not write to {path}"
