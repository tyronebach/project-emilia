"""
Abstract provider interface for Emilia standalone core.

All LLM backends (native OpenAI-compatible, OpenClaw adapter, etc.)
implement this interface so the chat runtime never branches on backend mode.

Phase A: interface definition only.  Implementations added in Phase B.
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator


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
            dict with at least {"content": str, "model": str, "usage": dict}.
        """
        raise NotImplementedError

    @abstractmethod
    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[str]:
        """Generate a streaming response, yielding text chunks.

        Args:
            messages: OpenAI-format message list.
            **kwargs: Provider-specific options.

        Yields:
            str chunks as they arrive from the backend.
        """
        raise NotImplementedError
        yield  # make this a generator for type checkers
