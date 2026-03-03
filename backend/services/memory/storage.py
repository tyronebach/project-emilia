"""SQLite storage helpers for the standalone memory engine."""
from __future__ import annotations

import sqlite3
import struct
import time
import uuid
from typing import Any

from db.connection import get_db


def pack_embedding(values: list[float] | None) -> bytes | None:
    """Serialize a float vector to a SQLite BLOB."""
    if not values:
        return None
    return struct.pack(f"<{len(values)}f", *[float(v) for v in values])


def unpack_embedding(blob: bytes | None) -> list[float]:
    """Deserialize an embedding BLOB into a float vector."""
    if not blob:
        return []
    if len(blob) % 4 != 0:
        raise ValueError("Invalid embedding blob length")
    size = len(blob) // 4
    return list(struct.unpack(f"<{size}f", blob))


def _row_to_document(row: dict | None) -> dict | None:
    return dict(row) if row else None


def _row_to_chunk(row: dict | None) -> dict | None:
    if not row:
        return None
    payload = dict(row)
    payload["embedding"] = unpack_embedding(payload.get("embedding"))
    return payload


def get_document(document_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM memory_documents WHERE id = ?",
            (document_id,),
        ).fetchone()
    return _row_to_document(row)


def get_document_by_path(agent_id: str, user_id: str | None, path: str) -> dict | None:
    clauses = ["agent_id = ?", "path = ?"]
    params: list[Any] = [agent_id, path]
    if user_id is None:
        clauses.append("user_id IS NULL")
    else:
        clauses.append("(user_id = ? OR user_id IS NULL)")
        params.append(user_id)

    sql = (
        "SELECT * FROM memory_documents "
        f"WHERE {' AND '.join(clauses)} "
        "ORDER BY updated_at DESC LIMIT 1"
    )
    with get_db() as conn:
        row = conn.execute(sql, params).fetchone()
    return _row_to_document(row)


def list_documents(agent_id: str, user_id: str | None) -> list[dict]:
    clauses = ["agent_id = ?"]
    params: list[Any] = [agent_id]
    if user_id is None:
        clauses.append("user_id IS NULL")
    else:
        clauses.append("(user_id = ? OR user_id IS NULL)")
        params.append(user_id)

    sql = (
        "SELECT * FROM memory_documents "
        f"WHERE {' AND '.join(clauses)} "
        "ORDER BY path ASC"
    )
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def upsert_document(
    document_id: str | None,
    agent_id: str,
    user_id: str | None,
    path: str,
    content_hash: str,
) -> dict:
    now = time.time()
    existing = get_document_by_path(agent_id, user_id, path)
    doc_id = document_id or (existing or {}).get("id") or str(uuid.uuid4())

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO memory_documents (id, agent_id, user_id, path, content_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                agent_id = excluded.agent_id,
                user_id = excluded.user_id,
                path = excluded.path,
                content_hash = excluded.content_hash,
                updated_at = excluded.updated_at
            """,
            (doc_id, agent_id, user_id, path, content_hash, now, now),
        )
        row = conn.execute(
            "SELECT * FROM memory_documents WHERE id = ?",
            (doc_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("Failed to upsert memory document")
    return dict(row)


def delete_document(document_id: str) -> int:
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM memory_documents WHERE id = ?",
            (document_id,),
        )
    return int(cur.rowcount or 0)


def replace_chunks(
    document_id: str,
    *,
    agent_id: str,
    user_id: str | None,
    chunks: list[dict[str, Any]],
) -> list[dict]:
    now = time.time()
    with get_db() as conn:
        conn.execute("DELETE FROM memory_chunks WHERE document_id = ?", (document_id,))
        for chunk in chunks:
            conn.execute(
                """
                INSERT INTO memory_chunks (
                    id, document_id, agent_id, user_id, chunk_index, content,
                    embedding, fts_tokens, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk.get("id") or str(uuid.uuid4()),
                    document_id,
                    agent_id,
                    user_id,
                    int(chunk["chunk_index"]),
                    chunk["content"],
                    pack_embedding(chunk.get("embedding")),
                    chunk.get("fts_tokens") or chunk["content"],
                    now,
                ),
            )
        rows = conn.execute(
            "SELECT * FROM memory_chunks WHERE document_id = ? ORDER BY chunk_index ASC",
            (document_id,),
        ).fetchall()
    return [_row_to_chunk(row) for row in rows if row]


def add_chunk(
    chunk_id: str,
    document_id: str,
    agent_id: str,
    user_id: str | None,
    chunk_index: int,
    content: str,
    embedding: list[float] | None = None,
    fts_tokens: str | None = None,
) -> dict:
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO memory_chunks (
                id, document_id, agent_id, user_id, chunk_index, content,
                embedding, fts_tokens, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chunk_id,
                document_id,
                agent_id,
                user_id,
                chunk_index,
                content,
                pack_embedding(embedding),
                fts_tokens or content,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM memory_chunks WHERE id = ?",
            (chunk_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("Failed to add memory chunk")
    return _row_to_chunk(row) or {}


def get_chunks(document_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM memory_chunks WHERE document_id = ? ORDER BY chunk_index ASC",
            (document_id,),
        ).fetchall()
    return [_row_to_chunk(row) for row in rows if row]


def search_fts(query: str, agent_id: str, user_id: str | None, top_k: int = 10) -> list[dict]:
    clauses = ["mc.agent_id = ?"]
    params: list[Any] = [agent_id, query, top_k]
    if user_id is None:
        clauses.append("mc.user_id IS NULL")
    else:
        clauses.append("(mc.user_id = ? OR mc.user_id IS NULL)")
        params.insert(1, user_id)

    sql = f"""
        SELECT
            mc.*,
            md.path AS path,
            bm25(memory_chunks_fts) AS bm25_rank
        FROM memory_chunks_fts
        JOIN memory_chunks mc ON mc.rowid = memory_chunks_fts.rowid
        JOIN memory_documents md ON md.id = mc.document_id
        WHERE {' AND '.join(clauses)} AND memory_chunks_fts MATCH ?
        ORDER BY bm25_rank ASC
        LIMIT ?
    """
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    results: list[dict] = []
    for row in rows:
        payload = _row_to_chunk(row) or {}
        payload["path"] = row.get("path")
        payload["bm25_rank"] = float(row.get("bm25_rank") or 0.0)
        results.append(payload)
    return results


def list_chunk_candidates(agent_id: str, user_id: str | None) -> list[dict]:
    clauses = ["mc.agent_id = ?"]
    params: list[Any] = [agent_id]
    if user_id is None:
        clauses.append("mc.user_id IS NULL")
    else:
        clauses.append("(mc.user_id = ? OR mc.user_id IS NULL)")
        params.append(user_id)

    sql = f"""
        SELECT mc.*, md.path AS path
        FROM memory_chunks mc
        JOIN memory_documents md ON md.id = mc.document_id
        WHERE {' AND '.join(clauses)}
        ORDER BY md.updated_at DESC, mc.chunk_index ASC
    """
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    results: list[dict] = []
    for row in rows:
        payload = _row_to_chunk(row) or {}
        payload["path"] = row.get("path")
        results.append(payload)
    return results


def raw_connection() -> sqlite3.Connection:
    """Expose a raw connection for rare advanced operations."""
    ctx = get_db()
    return ctx.__enter__()
