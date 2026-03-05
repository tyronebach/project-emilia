"""Top-of-mind memory recollection helper for prompt injection."""
from __future__ import annotations

from typing import Any

from config import settings
from services.memory.search import search


def _line_from_hit(hit: dict[str, Any]) -> str:
    score = float(hit.get("score") or 0.0)
    path = str(hit.get("path") or "memory")
    snippet = " ".join(str(hit.get("snippet") or "").split())
    if len(snippet) > 140:
        snippet = snippet[:140].rstrip() + "..."
    return f"- [score {score:.2f} | {path}] {snippet}"


def _format_block(lines: list[str]) -> str:
    return "\n".join([
        "## Top-of-Mind Recollections",
        *lines,
        "Use naturally if relevant. Do not force references.",
    ])


async def build_top_of_mind_context(
    *,
    query: str,
    agent_id: str,
    user_id: str | None,
    workspace: str | None,
    runtime_trigger: bool,
) -> str | None:
    if not settings.memory_autorecall_enabled:
        return None
    if runtime_trigger and not settings.memory_autorecall_runtime_trigger_enabled:
        return None

    query_text = (query or "").strip()
    if not query_text:
        return None

    hits = await search(
        query=query_text,
        agent_id=agent_id,
        user_id=user_id,
        workspace=workspace,
        top_k=max(1, settings.memory_autorecall_max_items * 3),
        min_score=max(0.0, min(1.0, settings.memory_autorecall_score_threshold)),
    )
    if not hits:
        return None

    selected: list[dict[str, Any]] = []
    seen_paths: set[tuple[str, int]] = set()
    for hit in hits:
        score = float(hit.get("score") or 0.0)
        if score < settings.memory_autorecall_score_threshold:
            continue
        path = str(hit.get("path") or "")
        chunk_index = int(hit.get("chunk_index") or 0)
        key = (path, chunk_index)
        if key in seen_paths:
            continue
        seen_paths.add(key)
        selected.append(hit)
        if len(selected) >= settings.memory_autorecall_max_items:
            break

    if not selected:
        return None

    lines: list[str] = []
    for hit in selected:
        candidate = _line_from_hit(hit)
        possible = lines + [candidate]
        block = _format_block(possible)
        if len(block) > settings.memory_autorecall_max_chars:
            break
        lines.append(candidate)

    if not lines:
        return None
    return _format_block(lines)
