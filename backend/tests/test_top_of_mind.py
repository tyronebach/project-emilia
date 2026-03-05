from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from services.memory.top_of_mind import build_top_of_mind_context

pytestmark = pytest.mark.anyio


@patch("services.memory.top_of_mind.search", new_callable=AsyncMock)
async def test_top_of_mind_filters_and_caps(mock_search, monkeypatch):
    monkeypatch.setattr("config.settings.memory_autorecall_enabled", True)
    monkeypatch.setattr("config.settings.memory_autorecall_runtime_trigger_enabled", False)
    monkeypatch.setattr("config.settings.memory_autorecall_score_threshold", 0.86)
    monkeypatch.setattr("config.settings.memory_autorecall_max_items", 2)
    monkeypatch.setattr("config.settings.memory_autorecall_max_chars", 180)

    mock_search.return_value = [
        {"path": "MEMORY.md", "chunk_index": 1, "score": 0.93, "snippet": "User prefers short direct feedback."},
        {"path": "MEMORY.md", "chunk_index": 1, "score": 0.91, "snippet": "Duplicate hit should be removed."},
        {"path": "memory/2026-03-01.md", "chunk_index": 3, "score": 0.88, "snippet": "User felt ignored during long delays."},
        {"path": "memory/2026-03-02.md", "chunk_index": 4, "score": 0.5, "snippet": "Low score should be dropped."},
    ]

    block = await build_top_of_mind_context(
        query="you ignored me",
        agent_id="agent-1",
        user_id="user-1",
        workspace=None,
        runtime_trigger=False,
    )

    assert block is not None
    assert "Top-of-Mind" in block
    assert block.count("\n- [score") <= 2
    assert "Low score" not in block
    assert len(block) <= 180


@patch("services.memory.top_of_mind.search", new_callable=AsyncMock)
async def test_top_of_mind_skips_runtime_trigger_when_disabled(mock_search, monkeypatch):
    monkeypatch.setattr("config.settings.memory_autorecall_enabled", True)
    monkeypatch.setattr("config.settings.memory_autorecall_runtime_trigger_enabled", False)

    block = await build_top_of_mind_context(
        query="state tick",
        agent_id="agent-1",
        user_id="user-1",
        workspace=None,
        runtime_trigger=True,
    )

    assert block is None
    mock_search.assert_not_called()
