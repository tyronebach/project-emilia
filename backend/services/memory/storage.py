"""
Memory storage: read/write memory_documents and memory_chunks.

Phase A: stubs only.  Implementation in Phase C.
"""


def get_document(document_id: str) -> dict | None:
    """Fetch a memory document row by ID.

    Returns the row dict or None if not found.
    """
    raise NotImplementedError("memory.storage.get_document — Phase C")


def list_documents(agent_id: str, user_id: str) -> list[dict]:
    """List all documents for a given agent+user pair."""
    raise NotImplementedError("memory.storage.list_documents — Phase C")


def upsert_document(
    document_id: str,
    agent_id: str,
    user_id: str,
    path: str,
    content_hash: str,
) -> dict:
    """Insert or replace a memory document row.

    Returns the final row dict.
    """
    raise NotImplementedError("memory.storage.upsert_document — Phase C")


def delete_document(document_id: str) -> int:
    """Delete a document and its chunks (cascade).

    Returns the number of document rows deleted (0 or 1).
    """
    raise NotImplementedError("memory.storage.delete_document — Phase C")


def add_chunk(
    chunk_id: str,
    document_id: str,
    agent_id: str,
    user_id: str,
    start_char: int,
    end_char: int,
    text: str,
) -> dict:
    """Insert a memory chunk row.

    Returns the inserted row dict.
    """
    raise NotImplementedError("memory.storage.add_chunk — Phase C")


def get_chunks(document_id: str) -> list[dict]:
    """Return all chunks for a document, ordered by start_char."""
    raise NotImplementedError("memory.storage.get_chunks — Phase C")
