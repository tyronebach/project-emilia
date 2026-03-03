"""
Memory indexer: chunk documents and store them with embeddings.

Phase A: stubs only.  Implementation in Phase C.
"""


def index_document(
    agent_id: str,
    user_id: str,
    path: str,
    content: str,
) -> dict:
    """Chunk *content*, embed each chunk, and persist to DB.

    Args:
        agent_id: Owning agent ID.
        user_id:  Owning user ID.
        path:     Logical path/key for the document (e.g. 'journal/2026-03').
        content:  Raw text content to index.

    Returns:
        The persisted memory_document row dict.
    """
    raise NotImplementedError("memory.indexer.index_document — Phase C")


def reindex_document(document_id: str, content: str) -> dict:
    """Re-chunk and re-embed an existing document (content changed).

    Deletes old chunks and inserts fresh ones.
    Returns the updated document row.
    """
    raise NotImplementedError("memory.indexer.reindex_document — Phase C")
