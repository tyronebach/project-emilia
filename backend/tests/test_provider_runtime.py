"""Provider runtime tests for Phase B."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.llm_caller import call_llm_non_stream
from services.providers.registry import get_provider


pytestmark = pytest.mark.anyio


def test_provider_registry_falls_back_from_legacy_chat_mode() -> None:
    provider = get_provider({
        "chat_mode": "direct",
        "provider": "",
        "provider_config": '{"model":"gpt-fallback"}',
    })

    assert provider.__class__.__name__ == "NativeProvider"
    assert provider.config["model"] == "gpt-fallback"


@patch("services.llm_caller.AgentRepository.get_by_id")
@patch("services.llm_caller.get_provider")
async def test_call_llm_non_stream_uses_provider_registry(
    mock_get_provider,
    mock_get_by_id,
) -> None:
    mock_get_by_id.return_value = {
        "id": "agent-1",
        "workspace": "/tmp/workspace",
        "clawdbot_agent_id": "claw-agent-1",
        "provider": "native",
        "provider_config": {"model": "gpt-provider"},
    }
    mock_provider = MagicMock()
    mock_provider.generate = AsyncMock(
        return_value={
            "model": "gpt-provider",
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
    )
    mock_get_provider.return_value = mock_provider

    result = await call_llm_non_stream(
        {"agent_id": "agent-1"},
        [{"role": "user", "content": "Hi"}],
        "room-1",
    )

    assert result["model"] == "gpt-provider"
    mock_get_provider.assert_called_once()
    mock_provider.generate.assert_awaited_once()
