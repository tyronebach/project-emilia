"""
Memory search: hybrid semantic + FTS retrieval.

Phase A: stubs only.  Implementation in Phase C.
"""


def search(
    query: str,
    agent_id: str,
    user_id: str,
    top_k: int = 5,
) -> list[dict]:
    """Retrieve the most relevant memory chunks for *query*.

    Uses a hybrid ranking strategy combining:
    - Cosine similarity on dense embeddings (semantic)
    - SQLite FTS5 BM25 score (keyword)

    Args:
        query:    Natural-language query string.
        agent_id: Scope results to this agent.
        user_id:  Scope results to this user.
        top_k:    Maximum number of chunks to return.

    Returns:
        List of chunk dicts ordered by relevance (descending), each with an
        additional 'score' key.
    """
    raise NotImplementedError("memory.search.search — Phase C")


def fts_search(
    query: str,
    agent_id: str,
    user_id: str,
    top_k: int = 10,
) -> list[dict]:
    """Keyword-only FTS5 search over memory chunks.

    Used as a fallback when embeddings are not yet available.
    """
    raise NotImplementedError("memory.search.fts_search — Phase C")
