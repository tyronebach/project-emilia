from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from services.compaction import CompactionService

pytestmark = pytest.mark.anyio


@patch("services.compaction.DirectLLMClient.chat_completion", new_callable=AsyncMock)
async def test_compaction_persona_mode_fallbacks_on_invalid_structure(mock_chat, monkeypatch):
    monkeypatch.setattr("config.settings.compaction_persona_mode", "dm_only")
    mock_chat.side_effect = [
        {"choices": [{"message": {"content": "This has no required sections."}}]},
        {"choices": [{"message": {"content": "Fallback neutral summary"}}]},
    ]

    summary = await CompactionService.summarize_messages(
        [{"role": "user", "content": "[User]: hi"}],
        room_type="dm",
        agent_name="Emilia",
        agent_workspace=None,
    )

    assert summary == "Fallback neutral summary"
    assert mock_chat.await_count == 2


@patch("services.compaction.DirectLLMClient.chat_completion", new_callable=AsyncMock)
async def test_compaction_off_mode_keeps_single_call(mock_chat, monkeypatch):
    monkeypatch.setattr("config.settings.compaction_persona_mode", "off")
    mock_chat.return_value = {"choices": [{"message": {"content": "Neutral summary"}}]}

    summary = await CompactionService.summarize_messages(
        [{"role": "user", "content": "[User]: hi"}],
        room_type="dm",
    )

    assert summary == "Neutral summary"
    assert mock_chat.await_count == 1
