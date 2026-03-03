"""
Embedder abstraction for the internal memory engine.

Provides a common embed() interface so the indexer and search modules
stay decoupled from the underlying embedding backend.

Available backends:
  LocalEmbedder   — sentence-transformers (no external API, default)
  GeminiEmbedder  — Google Gemini text-embedding-004 (optional)

Phase A: stubs only.  Implementation in Phase C.
"""
from abc import ABC, abstractmethod


class Embedder(ABC):
    """Abstract base for text embedders."""

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts.

        Args:
            texts: List of strings to embed.

        Returns:
            List of float vectors, one per input string.
        """
        raise NotImplementedError


class LocalEmbedder(Embedder):
    """Sentence-transformers local embedder (no external API required)."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed *texts* using a local sentence-transformers model."""
        raise NotImplementedError("LocalEmbedder.embed — Phase C")


class GeminiEmbedder(Embedder):
    """Google Gemini text-embedding-004 embedder (optional plugin)."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed *texts* via the Gemini Embeddings API."""
        raise NotImplementedError("GeminiEmbedder.embed — Phase C")


def get_embedder() -> Embedder:
    """Return the configured embedder instance.

    Checks EMILIA_EMBEDDER env var:
      'gemini'  → GeminiEmbedder (requires GEMINI_API_KEY)
      anything else → LocalEmbedder (default)
    """
    raise NotImplementedError("embedder.get_embedder — Phase C")
