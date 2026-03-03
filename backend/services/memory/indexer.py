"""Chunking and indexing for standalone memory documents."""
from __future__ import annotations

import hashlib
import re
import uuid

from services.memory.embedder import get_embedder
from services.memory import storage

MAX_CHUNK_CHARS = 800
CHUNK_OVERLAP_CHARS = 120


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _fts_tokens(text: str) -> str:
    return " ".join(re.findall(r"[A-Za-z0-9_]+", text.lower()))


def _chunk_text(content: str) -> list[str]:
    text = content.strip()
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(length, start + MAX_CHUNK_CHARS)
        if end < length:
            split = text.rfind("\n\n", start, end)
            if split <= start:
                split = text.rfind("\n", start, end)
            if split <= start:
                split = text.rfind(" ", start, end)
            if split > start:
                end = split

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - CHUNK_OVERLAP_CHARS, start + 1)
    return chunks


async def index_document(
    agent_id: str,
    user_id: str | None,
    path: str,
    content: str,
) -> dict:
    doc = storage.upsert_document(
        document_id=None,
        agent_id=agent_id,
        user_id=user_id,
        path=path,
        content_hash=_content_hash(content),
    )

    chunks = _chunk_text(content)
    embeddings = await get_embedder().embed(chunks) if chunks else []
    storage.replace_chunks(
        doc["id"],
        agent_id=agent_id,
        user_id=user_id,
        chunks=[
            {
                "id": str(uuid.uuid4()),
                "chunk_index": idx,
                "content": chunk,
                "embedding": embeddings[idx] if idx < len(embeddings) else None,
                "fts_tokens": _fts_tokens(chunk),
            }
            for idx, chunk in enumerate(chunks)
        ],
    )
    return doc


async def reindex_document(document_id: str, content: str) -> dict:
    doc = storage.get_document(document_id)
    if not doc:
        raise ValueError("Memory document not found")
    return await index_document(
        agent_id=doc["agent_id"],
        user_id=doc.get("user_id"),
        path=doc["path"],
        content=content,
    )
