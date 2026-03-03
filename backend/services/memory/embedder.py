"""Embedder abstraction for the standalone memory engine."""
from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from config import settings

_GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-embedding-001:embedContent"
)


class Embedder(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class OllamaEmbedder(Embedder):
    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            for text in texts:
                response = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                )
                response.raise_for_status()
                data = response.json()
                embedding = data.get("embedding")
                if not isinstance(embedding, list) or not embedding:
                    raise RuntimeError("Ollama embedding response missing embedding vector")
                vectors.append([float(value) for value in embedding])
        return vectors


class GeminiEmbedder(Embedder):
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            for text in texts:
                response = await client.post(
                    _GEMINI_EMBED_URL,
                    params={"key": self.api_key},
                    json={
                        "model": f"models/{self.model}",
                        "content": {"parts": [{"text": text}]},
                        "taskType": "RETRIEVAL_DOCUMENT",
                    },
                )
                response.raise_for_status()
                data = response.json()
                embedding = (data.get("embedding") or {}).get("values")
                if not isinstance(embedding, list) or not embedding:
                    raise RuntimeError("Gemini embedding response missing embedding vector")
                vectors.append([float(value) for value in embedding])
        return vectors


def get_embedder() -> Embedder:
    """Return the configured embedder instance."""
    provider = settings.emilia_embed_provider
    if provider == "ollama":
        return OllamaEmbedder(
            model=settings.emilia_embed_model,
            base_url=settings.emilia_embed_base_url,
        )
    if provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required when EMILIA_EMBED_PROVIDER=gemini")
        return GeminiEmbedder(
            api_key=settings.gemini_api_key,
            model=settings.emilia_embed_model or "gemini-embedding-001",
        )
    raise RuntimeError(f"Unsupported embed provider: {provider}")
