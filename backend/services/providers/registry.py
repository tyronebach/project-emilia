"""
Provider registry: resolves an agent dict to the correct Provider instance.

Usage::

    from services.providers.registry import get_provider

    provider = get_provider(agent_dict)
    response = await provider.generate(messages)

Phase A: factory wired, provider implementations are stubs (Phase B/F).
"""
import json
from services.providers.base import Provider


def get_provider(agent: dict) -> Provider:
    """Return the appropriate Provider for the given agent row.

    Args:
        agent: Agent dict as returned by AgentRepository (must have 'provider'
               and optionally 'provider_config' keys).

    Returns:
        Provider instance ready for generate() / stream() calls.

    Raises:
        ValueError: If agent['provider'] is unknown.
    """
    provider_name = (agent.get("provider") or "native").strip().lower()

    raw_config = agent.get("provider_config") or "{}"
    if isinstance(raw_config, str):
        try:
            config = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            config = {}
    else:
        config = dict(raw_config)

    if provider_name == "native":
        from services.providers.native import NativeProvider
        return NativeProvider(config)

    if provider_name == "openclaw":
        from services.providers.openclaw import OpenClawProvider
        return OpenClawProvider(config)

    raise ValueError(f"Unknown provider: {provider_name!r}")
