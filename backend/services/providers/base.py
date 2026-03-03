"""
Abstract provider interface for Emilia standalone core.

All LLM backends (native OpenAI-compatible, OpenClaw adapter, etc.)
implement this interface so the chat runtime never branches on backend mode.
"""
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class Provider(ABC):
    """Abstract base class for LLM provider adapters."""

    # Subclasses declare which optional features they support.
    capabilities: dict = {}

    @abstractmethod
    async def generate(self, messages: list[dict], **kwargs) -> dict:
        """Generate a complete response (non-streaming).

        Args:
            messages: OpenAI-format message list.
            **kwargs: Provider-specific options (model, temperature, tools, …).

        Returns:
            OpenAI-compatible payload with at least:
            - choices[0].message.content
            - usage
            - model
        """
        raise NotImplementedError

    @abstractmethod
    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[dict[str, Any] | str]:
        """Generate a streaming response.

        Args:
            messages: OpenAI-format message list.
            **kwargs: Provider-specific options.

        Yields:
            Either string content chunks or structured dict chunks. Structured
            chunks should use:
            - {"type": "content", "content": "..."}
            - {"type": "usage", "usage": {...}}
            - {"type": "done", "model": "...", "finish_reason": "..."}
        """
        raise NotImplementedError
        yield  # make this a generator for type checkers
