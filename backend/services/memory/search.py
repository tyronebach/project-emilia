"""Hybrid standalone memory search."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path

from services.memory import storage
from services.memory.embedder import get_embedder
from services.memory.indexer import index_document
from services.memory.reader import list_files, read

VECTOR_WEIGHT = 0.7
TEXT_WEIGHT = 0.3
SNIPPET_MAX_CHARS = 700


def _tokenize_fts_query(query: str) -> str:
    tokens = [token.strip() for token in query.split() if token.strip()]
    if not tokens:
        return ""
    return " AND ".join(f'"{token}"' for token in tokens)


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


async def _sync_workspace(agent_id: str, user_id: str | None, workspace: str | Path | None) -> None:
    if not workspace:
        return
    for path in list_files(workspace):
        content = read(workspace, path, truncate=False)
        if content.startswith("Error:"):
            continue
        existing = storage.get_document_by_path(agent_id, user_id, path)
        if existing and existing.get("content_hash") == hashlib.sha256(content.encode("utf-8")).hexdigest():
            continue
        await index_document(agent_id=agent_id, user_id=user_id, path=path, content=content)


def _merge_results(
    vector_hits: list[dict],
    fts_hits: list[dict],
    *,
    top_k: int,
    min_score: float,
) -> list[dict]:
    merged: dict[str, dict] = {}

    for row in vector_hits:
        merged[row["id"]] = {
            **row,
            "score": VECTOR_WEIGHT * float(row.get("vector_score") or 0.0),
        }

    for row in fts_hits:
        score = float(row.get("fts_score") or 0.0)
        if row["id"] in merged:
            merged[row["id"]]["score"] += TEXT_WEIGHT * score
        else:
            merged[row["id"]] = {**row, "score": TEXT_WEIGHT * score}

    results = sorted(merged.values(), key=lambda item: item["score"], reverse=True)
    return [
        {
            "path": item.get("path", ""),
            "chunk_index": item.get("chunk_index"),
            "snippet": str(item.get("content") or "")[:SNIPPET_MAX_CHARS],
            "score": round(float(item["score"]), 4),
            "source": "memory",
        }
        for item in results
        if float(item["score"]) >= min_score
    ][:top_k]


async def search(
    query: str,
    agent_id: str,
    claw_agent_id: str | None = None,
    *,
    user_id: str | None = None,
    workspace: str | Path | None = None,
    limit: int | None = None,
    top_k: int = 5,
    min_score: float = 0.3,
) -> list[dict]:
    del claw_agent_id
    effective_top_k = limit or top_k
    await _sync_workspace(agent_id, user_id, workspace)

    query_text = (query or "").strip()
    if not query_text:
        return []

    query_vector = (await get_embedder().embed([query_text]))[0]

    vector_hits = []
    for row in storage.list_chunk_candidates(agent_id, user_id):
        score = _cosine_similarity(query_vector, row.get("embedding") or [])
        if score <= 0:
            continue
        vector_hits.append({**row, "vector_score": score})
    vector_hits.sort(key=lambda row: row["vector_score"], reverse=True)
    vector_hits = vector_hits[: max(effective_top_k * 4, effective_top_k)]

    fts_query = _tokenize_fts_query(query_text)
    fts_hits: list[dict] = []
    if fts_query:
        for row in storage.search_fts(fts_query, agent_id, user_id, top_k=max(effective_top_k * 4, effective_top_k)):
            rank = float(row.get("bm25_rank") or 0.0)
            row["fts_score"] = 1.0 / (1.0 + max(0.0, rank))
            fts_hits.append(row)

    return _merge_results(vector_hits, fts_hits, top_k=effective_top_k, min_score=min_score)


async def fts_search(
    query: str,
    agent_id: str,
    user_id: str | None,
    top_k: int = 10,
) -> list[dict]:
    fts_query = _tokenize_fts_query(query)
    if not fts_query:
        return []
    results = []
    for row in storage.search_fts(fts_query, agent_id, user_id, top_k=top_k):
        rank = float(row.get("bm25_rank") or 0.0)
        results.append({
            "path": row.get("path", ""),
            "chunk_index": row.get("chunk_index"),
            "snippet": str(row.get("content") or "")[:SNIPPET_MAX_CHARS],
            "score": round(1.0 / (1.0 + max(0.0, rank)), 4),
            "source": "memory",
        })
    return results
