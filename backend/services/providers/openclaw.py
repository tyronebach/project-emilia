"""
OpenClaw gateway adapter stub.

Maps the Provider interface to the existing OpenClaw/Clawdbot backend so that
agents with provider='openclaw' continue to work without infecting core
abstractions.

provider_config keys used:
  - clawdbot_agent_id (str)
  - endpoint          (str, optional)
  - token             (str, optional — falls back to env CLAWDBOT_TOKEN)

Phase A: stub only.  Full implementation in Phase F.
"""
from typing import AsyncIterator
from services.providers.base import Provider


class OpenClawProvider(Provider):
    """Adapter that forwards requests to the OpenClaw gateway."""

    capabilities = {
        "streaming": True,
        "tools": False,
        "vision": False,
    }

    def __init__(self, config: dict):
        """Initialise with provider_config dict from the agent row."""
        self.config = config

    async def generate(self, messages: list[dict], **kwargs) -> dict:
        """Forward a generate request to OpenClaw."""
        raise NotImplementedError("OpenClawProvider.generate — implemented in Phase F")

    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[str]:
        """Forward a streaming request to OpenClaw."""
        raise NotImplementedError("OpenClawProvider.stream — implemented in Phase F")
        yield  # pragma: no cover
