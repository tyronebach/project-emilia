from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from services.compaction import CompactionService

pytestmark = pytest.mark.anyio


@patch("services.compaction.log_metric")
@patch("services.compaction.DirectLLMClient.chat_completion", new_callable=AsyncMock)
async def test_compaction_persona_mode_fallbacks_on_invalid_structure(
    mock_chat,
    mock_log_metric,
    monkeypatch,
    caplog,
):
    monkeypatch.setattr("config.settings.compaction_persona_mode", "dm_only")
    caplog.set_level("WARNING", logger="services.compaction")
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
    assert "Compaction persona summary failed validation" in caplog.text

    metric_names = [metric_call.args[1] for metric_call in mock_log_metric.call_args_list]
    assert "compaction_persona_fallback" in metric_names
    fallback_call = next(
        metric_call for metric_call in mock_log_metric.call_args_list
        if metric_call.args[1] == "compaction_persona_fallback"
    )
    assert fallback_call.kwargs["mode"] == "persona"
    assert fallback_call.kwargs["room_type"] == "dm"

    compaction_call = next(
        metric_call for metric_call in mock_log_metric.call_args_list
        if metric_call.args[1] == "compaction"
    )
    assert compaction_call.kwargs["persona_fallback"] is True


@patch("services.compaction.log_metric")
@patch("services.compaction.DirectLLMClient.chat_completion", new_callable=AsyncMock)
async def test_compaction_off_mode_keeps_single_call(mock_chat, mock_log_metric, monkeypatch):
    monkeypatch.setattr("config.settings.compaction_persona_mode", "off")
    mock_chat.return_value = {"choices": [{"message": {"content": "Neutral summary"}}]}

    summary = await CompactionService.summarize_messages(
        [{"role": "user", "content": "[User]: hi"}],
        room_type="dm",
    )

    assert summary == "Neutral summary"
    assert mock_chat.await_count == 1
    compaction_call = next(
        metric_call for metric_call in mock_log_metric.call_args_list
        if metric_call.args[1] == "compaction"
    )
    assert compaction_call.kwargs["persona_fallback"] is False
