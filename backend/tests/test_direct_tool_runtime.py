"""Tests for direct-mode tool loop runtime."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.direct_tool_runtime import MEMORY_TOOLS, run_tool_loop

pytestmark = pytest.mark.anyio


def _make_content_result(content: str, model: str = "test-model") -> dict:
    """Build a minimal chat completion result with content (no tool calls)."""
    return {
        "model": model,
        "choices": [{"message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }


def _make_tool_call_result(
    tool_name: str,
    arguments: dict,
    tool_call_id: str = "call_1",
    model: str = "test-model",
) -> dict:
    """Build a chat completion result with a single tool call."""
    return {
        "model": model,
        "choices": [{
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(arguments),
                    },
                }],
            },
        }],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }


class TestRunToolLoop:

    async def test_no_tool_calls_returns_content_immediately(self):
        client = MagicMock()
        client.chat_completion = AsyncMock(
            return_value=_make_content_result("Hello!")
        )

        result = await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "Hi"}],
            workspace=None,
            agent_id="test-agent",
        )

        assert result["choices"][0]["message"]["content"] == "Hello!"
        client.chat_completion.assert_awaited_once()

    @patch("services.direct_tool_runtime._execute_tool", new_callable=AsyncMock)
    async def test_single_tool_call_executes_and_returns(self, mock_execute):
        mock_execute.return_value = "Search results here"

        client = MagicMock()
        client.chat_completion = AsyncMock(
            side_effect=[
                _make_tool_call_result("memory_search", {"query": "test"}),
                _make_content_result("Based on search: answer"),
            ]
        )

        result = await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "Find my notes"}],
            workspace="/tmp/ws",
            agent_id="test-agent",
        )

        assert result["choices"][0]["message"]["content"] == "Based on search: answer"
        assert client.chat_completion.await_count == 2
        mock_execute.assert_awaited_once_with(
            name="memory_search",
            arguments_json=json.dumps({"query": "test"}),
            workspace="/tmp/ws",
            agent_id="test-agent",
            user_id=None,
            claw_agent_id=None,
        )

    @patch("services.direct_tool_runtime._execute_tool", new_callable=AsyncMock)
    async def test_chained_tool_calls(self, mock_execute):
        mock_execute.side_effect = [
            json.dumps([{"path": "MEMORY.md", "snippet": "found it"}]),
            "Full file content here",
        ]

        client = MagicMock()
        client.chat_completion = AsyncMock(
            side_effect=[
                _make_tool_call_result("memory_search", {"query": "notes"}, tool_call_id="call_1"),
                _make_tool_call_result("memory_read", {"path": "MEMORY.md"}, tool_call_id="call_2"),
                _make_content_result("Here's what I found"),
            ]
        )

        result = await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "Read my notes"}],
            workspace="/tmp/ws",
            agent_id="test-agent",
        )

        assert result["choices"][0]["message"]["content"] == "Here's what I found"
        assert client.chat_completion.await_count == 3
        assert mock_execute.await_count == 2

    @patch("services.direct_tool_runtime._execute_tool", new_callable=AsyncMock)
    async def test_max_step_termination(self, mock_execute):
        mock_execute.return_value = "result"

        # Always returns tool calls (never content)
        tool_result = _make_tool_call_result("memory_search", {"query": "x"})
        final_result = _make_content_result("Forced final answer")

        call_count = 0

        async def _side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            # Last call (after system nudge, without tools) returns content
            if "tools" not in kwargs or kwargs["tools"] is None:
                return final_result
            return tool_result

        client = MagicMock()
        client.chat_completion = AsyncMock(side_effect=_side_effect)

        result = await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "Loop forever"}],
            workspace="/tmp/ws",
            agent_id="test-agent",
            max_steps=2,
        )

        assert result["choices"][0]["message"]["content"] == "Forced final answer"
        # 2 tool-loop calls + 1 final (no tools)
        assert client.chat_completion.await_count == 3

    @patch("services.direct_tool_runtime._execute_tool", new_callable=AsyncMock)
    async def test_malformed_tool_args_returns_error_to_llm(self, mock_execute):
        mock_execute.return_value = "Error: invalid JSON arguments: {bad"

        bad_result = {
            "model": "test-model",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": "call_bad",
                        "type": "function",
                        "function": {
                            "name": "memory_search",
                            "arguments": "{bad",
                        },
                    }],
                },
            }],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }

        client = MagicMock()
        client.chat_completion = AsyncMock(
            side_effect=[
                bad_result,
                _make_content_result("Recovered from error"),
            ]
        )

        result = await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "test"}],
            workspace=None,
            agent_id="test-agent",
        )

        assert result["choices"][0]["message"]["content"] == "Recovered from error"

    async def test_tools_are_passed_to_client(self):
        client = MagicMock()
        client.chat_completion = AsyncMock(
            return_value=_make_content_result("No tools needed")
        )

        await run_tool_loop(
            client=client,
            model="test-model",
            messages=[{"role": "user", "content": "Hi"}],
            workspace=None,
            agent_id="test-agent",
        )

        call_kwargs = client.chat_completion.call_args
        assert call_kwargs.kwargs["tools"] == MEMORY_TOOLS


class TestExecuteTool:

    @patch("services.memory.search.search", new_callable=AsyncMock)
    async def test_execute_memory_search(self, mock_search):
        from services.direct_tool_runtime import _execute_tool

        mock_search.return_value = [{"path": "MEMORY.md", "snippet": "found"}]
        result = await _execute_tool(
            name="memory_search",
            arguments_json=json.dumps({"query": "test"}),
            workspace="/tmp",
            agent_id="agent-1",
        )
        assert "MEMORY.md" in result
        mock_search.assert_awaited_once()

    @patch("services.memory.reader.read")
    async def test_execute_memory_read(self, mock_read):
        from services.direct_tool_runtime import _execute_tool

        mock_read.return_value = "file content"
        result = await _execute_tool(
            name="memory_read",
            arguments_json=json.dumps({"path": "MEMORY.md"}),
            workspace="/tmp",
            agent_id="agent-1",
        )
        assert result == "file content"

    @patch("services.memory.writer.write", new_callable=AsyncMock)
    async def test_execute_memory_write(self, mock_write):
        from services.direct_tool_runtime import _execute_tool

        mock_write.return_value = "OK: wrote 5 chars"
        result = await _execute_tool(
            name="memory_write",
            arguments_json=json.dumps({"path": "MEMORY.md", "content": "hello"}),
            workspace="/tmp",
            agent_id="agent-1",
        )
        assert result.startswith("OK:")

    async def test_execute_unknown_tool(self):
        from services.direct_tool_runtime import _execute_tool

        result = await _execute_tool(
            name="unknown_tool",
            arguments_json="{}",
            workspace="/tmp",
            agent_id="agent-1",
        )
        assert "unknown tool" in result

    async def test_execute_invalid_json_args(self):
        from services.direct_tool_runtime import _execute_tool

        result = await _execute_tool(
            name="memory_search",
            arguments_json="{bad json",
            workspace="/tmp",
            agent_id="agent-1",
        )
        assert "invalid JSON" in result
