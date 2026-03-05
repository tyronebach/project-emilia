from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from services.room_chat import PreparedAgentTurn
from services.room_chat_stream import stream_room_chat_sse


pytestmark = pytest.mark.anyio


def _http_status_error(status_code: int, detail: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.invalid/chat/completions")
    response = httpx.Response(status_code, request=request, text=detail)
    return httpx.HTTPStatusError(f"HTTP {status_code}", request=request, response=response)


def _prepared_turn() -> PreparedAgentTurn:
    return PreparedAgentTurn(
        agent_id="agent-1",
        workspace=None,
        effective_game_context=None,
        emotional_context=None,
        pre_llm_triggers=[],
        llm_messages=[{"role": "user", "content": "hello"}],
    )


async def _collect_stream_text() -> str:
    stream = stream_room_chat_sse(
        room_id="room-1",
        user_id="user-1",
        message="hello",
        game_context=None,
        runtime_trigger=False,
        room_agents=[{"agent_id": "agent-1", "display_name": "Alpha"}],
        responding_agents=[{"agent_id": "agent-1", "display_name": "Alpha"}],
        user_msg_id="user-msg-1",
    )
    chunks: list[str] = []
    async for row in stream:
        chunks.append(row)
    return "".join(chunks)


async def test_stream_http_500_retries_once_then_succeeds() -> None:
    attempts = {"count": 0}

    async def _provider_stream(*_args, **_kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise _http_status_error(500, "provider down")
        yield {"type": "content", "content": "retry ok"}
        yield {"type": "done", "model": "gpt-test", "finish_reason": "stop"}

    provider = SimpleNamespace(stream=_provider_stream)
    delete_by_id = MagicMock()
    sleep_mock = AsyncMock(return_value=None)

    with (
        patch("services.room_chat_stream.prepare_agent_turn_context", new=AsyncMock(return_value=_prepared_turn())),
        patch("services.room_chat_stream.get_provider", return_value=provider),
        patch("services.room_chat_stream.AgentRepository.get_by_id", return_value={"id": "agent-1"}),
        patch("services.room_chat_stream.RoomMessageRepository.add", return_value={"id": "m1", "timestamp": 1.0}),
        patch("services.room_chat_stream.RoomMessageRepository.delete_by_id", delete_by_id),
        patch("services.room_chat_stream.schedule_post_llm_tasks"),
        patch("services.room_chat_stream.serialize_room_message", return_value=SimpleNamespace(model_dump=lambda: {"id": "m1"})),
        patch("services.room_chat_stream._safe_get_mood_snapshot", return_value=None),
        patch("services.room_chat_stream._spawn_background", side_effect=lambda coro: (coro.close(), None)[1]),
        patch("services.room_chat_stream.asyncio.sleep", sleep_mock),
    ):
        text = await _collect_stream_text()

    assert attempts["count"] == 2
    assert sleep_mock.await_count == 1
    assert "event: agent_done" in text
    assert "event: agent_error" not in text
    delete_by_id.assert_not_called()


async def test_stream_http_400_does_not_retry_and_emits_agent_error() -> None:
    attempts = {"count": 0}

    async def _provider_stream(*_args, **_kwargs):
        attempts["count"] += 1
        raise _http_status_error(400, "bad request")
        yield  # pragma: no cover

    provider = SimpleNamespace(stream=_provider_stream)
    delete_by_id = MagicMock()
    sleep_mock = AsyncMock(return_value=None)

    with (
        patch("services.room_chat_stream.prepare_agent_turn_context", new=AsyncMock(return_value=_prepared_turn())),
        patch("services.room_chat_stream.get_provider", return_value=provider),
        patch("services.room_chat_stream.AgentRepository.get_by_id", return_value={"id": "agent-1"}),
        patch("services.room_chat_stream.RoomMessageRepository.add", return_value={"id": "m1", "timestamp": 1.0}),
        patch("services.room_chat_stream.RoomMessageRepository.delete_by_id", delete_by_id),
        patch("services.room_chat_stream.schedule_post_llm_tasks"),
        patch("services.room_chat_stream.serialize_room_message", return_value=SimpleNamespace(model_dump=lambda: {"id": "m1"})),
        patch("services.room_chat_stream._safe_get_mood_snapshot", return_value=None),
        patch("services.room_chat_stream._spawn_background", side_effect=lambda coro: (coro.close(), None)[1]),
        patch("services.room_chat_stream.asyncio.sleep", sleep_mock),
    ):
        text = await _collect_stream_text()

    assert attempts["count"] == 1
    assert sleep_mock.await_count == 0
    assert "event: agent_error" in text
    assert '"error_code": "provider_http_client_error"' in text
    assert '"retryable": false' in text
    assert '"status_code": 400' in text
    delete_by_id.assert_called_once_with("user-msg-1")


async def test_stream_timeout_retries_once_then_succeeds() -> None:
    attempts = {"count": 0}

    async def _provider_stream(*_args, **_kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise httpx.TimeoutException("timeout")
        yield {"type": "content", "content": "after timeout"}
        yield {"type": "done", "model": "gpt-test", "finish_reason": "stop"}

    provider = SimpleNamespace(stream=_provider_stream)
    delete_by_id = MagicMock()
    sleep_mock = AsyncMock(return_value=None)

    with (
        patch("services.room_chat_stream.prepare_agent_turn_context", new=AsyncMock(return_value=_prepared_turn())),
        patch("services.room_chat_stream.get_provider", return_value=provider),
        patch("services.room_chat_stream.AgentRepository.get_by_id", return_value={"id": "agent-1"}),
        patch("services.room_chat_stream.RoomMessageRepository.add", return_value={"id": "m1", "timestamp": 1.0}),
        patch("services.room_chat_stream.RoomMessageRepository.delete_by_id", delete_by_id),
        patch("services.room_chat_stream.schedule_post_llm_tasks"),
        patch("services.room_chat_stream.serialize_room_message", return_value=SimpleNamespace(model_dump=lambda: {"id": "m1"})),
        patch("services.room_chat_stream._safe_get_mood_snapshot", return_value=None),
        patch("services.room_chat_stream._spawn_background", side_effect=lambda coro: (coro.close(), None)[1]),
        patch("services.room_chat_stream.asyncio.sleep", sleep_mock),
    ):
        text = await _collect_stream_text()

    assert attempts["count"] == 2
    assert sleep_mock.await_count == 1
    assert "event: agent_done" in text
    assert "event: agent_error" not in text
    delete_by_id.assert_not_called()
