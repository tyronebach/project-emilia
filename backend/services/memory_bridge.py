"""Memory bridge: reads/writes OpenClaw's SQLite memory index and workspace files."""
from __future__ import annotations

import logging
import re
import sqlite3
import struct
from pathlib import Path
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── Module constants (match OpenClaw defaults) ──────────────────────
MAX_SEARCH_RESULTS = 5
MIN_SEARCH_SCORE = 0.3
SNIPPET_MAX_CHARS = 700
VECTOR_WEIGHT = 0.7
TEXT_WEIGHT = 0.3
CANDIDATE_MULTIPLIER = 3

# Read path: permissive (allow existing random files)
_VALID_MEMORY_PATH_READ = re.compile(r"^(?:MEMORY\.md|memory/[\w. -]+\.md)$")
# Write path: strict (only MEMORY.md or memory/YYYY-MM-DD.md)
_VALID_MEMORY_PATH_WRITE = re.compile(r"^(?:MEMORY\.md|memory/\d{4}-\d{2}-\d{2}\.md)$")
_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-embedding-001:embedContent"
)


# ── Database helpers ────────────────────────────────────────────────

def _open_memory_db(claw_agent_id: str) -> sqlite3.Connection | None:
    """Open the OpenClaw memory SQLite database read-only.

    Returns None if the file doesn't exist or sqlite-vec fails to load.
    """
    db_path = settings.openclaw_memory_dir / f"{claw_agent_id}.sqlite"
    if not db_path.exists():
        logger.warning("[MemoryBridge] DB not found: %s", db_path)
        return None

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
    except Exception:
        logger.exception("[MemoryBridge] Failed to open DB: %s", db_path)
        return None

    try:
        import sqlite_vec  # type: ignore[import-untyped]

        sqlite_vec.load(conn)
    except Exception:
        logger.warning("[MemoryBridge] sqlite-vec not available, vector search disabled")
        # Connection is still usable for FTS

    return conn


# ── Embedding helper ────────────────────────────────────────────────

async def _embed_query(text: str) -> list[float] | None:
    """Generate a query embedding via the Gemini API."""
    api_key = settings.gemini_api_key
    if not api_key:
        logger.warning("[MemoryBridge] GEMINI_API_KEY not set, skipping vector search")
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _GEMINI_EMBED_URL,
                params={"key": api_key},
                json={
                    "content": {"parts": [{"text": text}]},
                    "taskType": "RETRIEVAL_QUERY",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            values = data.get("embedding", {}).get("values")
            if values and isinstance(values, list):
                return values
            logger.warning("[MemoryBridge] Unexpected embedding response shape")
            return None
    except Exception:
        logger.exception("[MemoryBridge] Gemini embedding request failed")
        return None


# ── Search functions ────────────────────────────────────────────────

def _vector_search(
    conn: sqlite3.Connection,
    embedding: list[float],
    limit: int,
) -> list[dict[str, Any]]:
    """Cosine-distance vector search via chunks_vec."""
    try:
        blob = struct.pack(f"{len(embedding)}f", *embedding)
        rows = conn.execute(
            """SELECT c.id, c.path, c.start_line, c.end_line, c.text, c.source,
                      vec_distance_cosine(v.embedding, ?) AS dist
                 FROM chunks_vec v
                 JOIN chunks c ON c.id = v.id
                ORDER BY dist ASC
                LIMIT ?""",
            (blob, limit),
        ).fetchall()
        results = []
        for row in rows:
            score = 1.0 - float(row["dist"])
            results.append({
                "id": row["id"],
                "path": row["path"],
                "start_line": row["start_line"],
                "end_line": row["end_line"],
                "text": row["text"],
                "source": row["source"],
                "score": score,
            })
        return results
    except Exception:
        logger.exception("[MemoryBridge] Vector search failed")
        return []


def _fts_search(
    conn: sqlite3.Connection,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    """BM25 full-text search via chunks_fts."""
    try:
        # Tokenize: wrap each word in quotes, join with AND
        tokens = query.strip().split()
        if not tokens:
            return []
        fts_query = " AND ".join(f'"{tok}"' for tok in tokens)

        rows = conn.execute(
            """SELECT id, path, source, start_line, end_line, text,
                      bm25(chunks_fts) AS rank
                 FROM chunks_fts
                WHERE chunks_fts MATCH ?
                ORDER BY rank ASC
                LIMIT ?""",
            (fts_query, limit),
        ).fetchall()
        results = []
        for row in rows:
            score = 1.0 / (1.0 + max(0.0, float(row["rank"])))
            results.append({
                "id": row["id"],
                "path": row["path"],
                "start_line": row["start_line"],
                "end_line": row["end_line"],
                "text": row["text"],
                "source": row["source"],
                "score": score,
            })
        return results
    except Exception:
        logger.exception("[MemoryBridge] FTS search failed")
        return []


def _hybrid_merge(
    vec_results: list[dict],
    fts_results: list[dict],
    limit: int,
    min_score: float,
) -> list[dict]:
    """Weighted merge of vector and FTS results."""
    scores: dict[str, dict] = {}

    for r in vec_results:
        rid = r["id"]
        scores[rid] = {**r, "final_score": VECTOR_WEIGHT * r["score"]}

    for r in fts_results:
        rid = r["id"]
        if rid in scores:
            scores[rid]["final_score"] += TEXT_WEIGHT * r["score"]
        else:
            scores[rid] = {**r, "final_score": TEXT_WEIGHT * r["score"]}

    merged = sorted(scores.values(), key=lambda x: x["final_score"], reverse=True)
    return [
        {
            "path": r["path"],
            "start_line": r["start_line"],
            "end_line": r["end_line"],
            "snippet": r["text"][:SNIPPET_MAX_CHARS],
            "score": round(r["final_score"], 4),
            "source": r.get("source", "memory"),
        }
        for r in merged
        if r["final_score"] >= min_score
    ][:limit]


async def search(
    claw_agent_id: str,
    query: str,
    limit: int = MAX_SEARCH_RESULTS,
    min_score: float = MIN_SEARCH_SCORE,
) -> list[dict]:
    """Hybrid memory search. Falls back to FTS-only if vector is unavailable."""
    conn = _open_memory_db(claw_agent_id)
    if not conn:
        return []

    try:
        fetch_limit = limit * CANDIDATE_MULTIPLIER

        # Try hybrid (vector + FTS)
        embedding = await _embed_query(query)
        if embedding:
            vec_results = _vector_search(conn, embedding, fetch_limit)
            fts_results = _fts_search(conn, query, fetch_limit)
            return _hybrid_merge(vec_results, fts_results, limit, min_score)

        # FTS-only fallback
        fts_results = _fts_search(conn, query, fetch_limit)
        return [
            {
                "path": r["path"],
                "start_line": r["start_line"],
                "end_line": r["end_line"],
                "snippet": r["text"][:SNIPPET_MAX_CHARS],
                "score": round(r["score"], 4),
                "source": r.get("source", "memory"),
            }
            for r in fts_results
            if r["score"] >= min_score
        ][:limit]
    finally:
        conn.close()


# ── File read/write ─────────────────────────────────────────────────

def _validate_memory_path(path: str, *, for_write: bool = False) -> bool:
    """Validate that a path matches allowed memory file patterns.
    
    Read: permissive (MEMORY.md or memory/*.md)
    Write: strict (MEMORY.md or memory/YYYY-MM-DD.md only)
    """
    pattern = _VALID_MEMORY_PATH_WRITE if for_write else _VALID_MEMORY_PATH_READ
    return bool(pattern.match(path))


def read(
    workspace: str | None,
    path: str,
    start_line: int | None = None,
    num_lines: int | None = None,
) -> str:
    """Read content from a memory file in the agent workspace."""
    if not workspace:
        return "Error: no workspace configured for this agent"
    if not _validate_memory_path(path):
        return f"Error: invalid memory path '{path}' (must be MEMORY.md or memory/*.md)"

    file_path = Path(workspace) / path
    if not file_path.exists() or not file_path.is_file():
        return f"Error: file not found: {path}"

    try:
        text = file_path.read_text(encoding="utf-8")
    except Exception:
        logger.exception("[MemoryBridge] Failed to read %s", file_path)
        return f"Error: could not read {path}"

    # Apply line range if requested
    if start_line is not None or num_lines is not None:
        lines = text.splitlines(keepends=True)
        start = max(0, (start_line or 1) - 1)  # 1-indexed to 0-indexed
        end = start + (num_lines or len(lines))
        text = "".join(lines[start:end])

    if len(text) > SNIPPET_MAX_CHARS:
        return text[:SNIPPET_MAX_CHARS] + "\n... (truncated)"
    return text


def write(
    workspace: str | None,
    path: str,
    content: str,
    mode: str = "append",
) -> str:
    """Write or append to a memory file in the agent workspace."""
    if not workspace:
        return "Error: no workspace configured for this agent"
    if not _validate_memory_path(path, for_write=True):
        return f"Error: invalid memory path '{path}' (must be MEMORY.md or memory/YYYY-MM-DD.md, e.g. memory/2026-02-12.md)"

    file_path = Path(workspace) / path

    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if mode == "overwrite":
            file_path.write_text(content, encoding="utf-8")
        else:
            with file_path.open("a", encoding="utf-8") as f:
                f.write(content)
        return f"OK: wrote {len(content)} chars to {path} (mode={mode})"
    except Exception:
        logger.exception("[MemoryBridge] Failed to write %s", file_path)
        return f"Error: could not write to {path}"
