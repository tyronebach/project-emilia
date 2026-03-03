"""
Native OpenAI-compatible provider stub.

Talks directly to any OpenAI-compatible endpoint (OpenAI, local Ollama, etc.)
using the provider_config fields:
  - model (str)
  - api_base (str, optional — defaults to OpenAI)
  - api_key  (str, optional — falls back to env OPENAI_API_KEY)

Phase A: stub only.  Full implementation in Phase B.
"""
from typing import AsyncIterator
from services.providers.base import Provider


class NativeProvider(Provider):
    """OpenAI-compatible direct provider."""

    capabilities = {
        "streaming": True,
        "tools": True,
        "vision": False,
    }

    def __init__(self, config: dict):
        """Initialise with provider_config dict from the agent row."""
        self.config = config

    async def generate(self, messages: list[dict], **kwargs) -> dict:
        """Generate a complete response via the native endpoint."""
        raise NotImplementedError("NativeProvider.generate — implemented in Phase B")

    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[str]:
        """Stream a response via the native endpoint."""
        raise NotImplementedError("NativeProvider.stream — implemented in Phase B")
        yield  # pragma: no cover
