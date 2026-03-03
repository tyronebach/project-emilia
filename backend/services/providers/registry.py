import json

from services.providers.base import Provider


def _parse_provider_config(raw_config: object) -> dict:
    if isinstance(raw_config, str):
        try:
            parsed = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    if isinstance(raw_config, dict):
        return dict(raw_config)
    return {}


def _resolve_provider_name(agent: dict) -> str:
    provider_name = str(agent.get("provider") or "").strip().lower()
    if provider_name in {"native", "openclaw"}:
        return provider_name
    return "native"


def get_provider(agent: dict) -> Provider:
    """Return the appropriate Provider for the given agent row.

    Args:
        agent: Agent dict as returned by AgentRepository.

    Returns:
        Provider instance ready for generate() / stream() calls.

    Raises:
        ValueError: If agent['provider'] is unknown.
    """
    provider_name = _resolve_provider_name(agent)
    config = _parse_provider_config(agent.get("provider_config"))

    if provider_name == "native":
        from services.providers.native import NativeProvider
        return NativeProvider(config=config, agent=agent)

    if provider_name == "openclaw":
        from services.providers.openclaw import OpenClawProvider
        return OpenClawProvider(config=config)

    raise ValueError(f"Unknown provider: {provider_name!r}")
