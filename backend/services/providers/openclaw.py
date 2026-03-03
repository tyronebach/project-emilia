"""Standalone-mode stub for the deprecated OpenClaw provider."""
from typing import AsyncIterator
from services.providers.base import Provider


ERROR_MESSAGE = "OpenClaw provider not available in standalone mode"


class OpenClawProvider(Provider):
    """Explicit stub so legacy configs fail clearly in standalone mode."""

    capabilities = {
        "streaming": True,
        "tools": False,
        "vision": False,
    }

    def __init__(self, config: dict):
        """Initialise with provider_config dict from the agent row."""
        self.config = config

    async def generate(self, messages: list[dict], **kwargs) -> dict:
        raise NotImplementedError(ERROR_MESSAGE)

    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[str]:
        raise NotImplementedError(ERROR_MESSAGE)
        yield  # pragma: no cover
