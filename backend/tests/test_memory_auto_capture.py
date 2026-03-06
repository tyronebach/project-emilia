from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from config import settings
from services.memory import auto_capture


pytestmark = pytest.mark.anyio


async def test_candidate_facts_llm_parses_fenced_json() -> None:
    completion = {
        "choices": [
            {
                "message": {
                    "content": """```json
{"items":[{"kind":"preference","memory":"I prefer tea over coffee","confidence":0.93}]}
```"""
                }
            }
        ]
    }

    with patch("services.memory.auto_capture.DirectLLMClient.chat_completion", new=AsyncMock(return_value=completion)):
        got = await auto_capture._candidate_facts_llm(
            user_message="I prefer tea over coffee.",
            agent_response="Got it.",
        )

    assert got == [("- preference: I prefer tea over coffee", 0.93)]


async def test_maybe_autocapture_memory_filters_confidence_and_dedupes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "memory_autocapture_enabled", True)
    monkeypatch.setattr(settings, "memory_autocapture_min_confidence", 0.82)
    monkeypatch.setattr(settings, "memory_autocapture_max_items_per_day", 8)

    existing = "- preference: I prefer tea over coffee\n"

    with (
        patch("services.memory.auto_capture.read", return_value=existing),
        patch(
            "services.memory.auto_capture._candidate_facts_llm",
            new=AsyncMock(
                return_value=[
                    ("- preference: I prefer tea over coffee", 0.95),  # duplicate
                    ("- commitment: I will run tomorrow morning", 0.90),
                    ("- fact: I might move someday", 0.60),  # below threshold
                ]
            ),
        ),
        patch("services.memory.auto_capture.write", new=AsyncMock(return_value="ok")) as mock_write,
    ):
        result = await auto_capture.maybe_autocapture_memory(
            workspace="/tmp/ws",
            agent_id="agent-1",
            user_id="user-1",
            user_message="I will run tomorrow morning",
            agent_response="I will remember.",
        )

    assert result == "ok"
    mock_write.assert_awaited_once()
    payload = mock_write.await_args.kwargs["content"]
    assert "- commitment: I will run tomorrow morning" in payload
    assert "- preference: I prefer tea over coffee" not in payload
    assert "- fact: I might move someday" not in payload


async def test_maybe_autocapture_memory_returns_none_when_extractor_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "memory_autocapture_enabled", True)

    with (
        patch("services.memory.auto_capture.read", return_value=""),
        patch("services.memory.auto_capture._candidate_facts_llm", new=AsyncMock(return_value=[])),
        patch("services.memory.auto_capture.write", new=AsyncMock()) as mock_write,
    ):
        result = await auto_capture.maybe_autocapture_memory(
            workspace="/tmp/ws",
            agent_id="agent-1",
            user_id="user-1",
            user_message="hello",
            agent_response="hi",
        )

    assert result is None
    mock_write.assert_not_called()
