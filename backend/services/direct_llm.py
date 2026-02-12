"""Direct OpenAI-compatible chat helpers."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from config import settings

SUPPORTED_CHAT_MODES = {"openclaw", "direct"}
MAX_SOUL_MD_CHARS = 50_000


def normalize_chat_mode(raw_mode: Any) -> str:
    """Normalize stored chat_mode values to a supported mode."""
    mode = str(raw_mode or "").strip().lower()
    if mode in SUPPORTED_CHAT_MODES:
        return mode
    return "openclaw"


def resolve_direct_model(agent: dict[str, Any] | None) -> str:
    """Resolve direct model from agent overrides or global default."""
    if isinstance(agent, dict):
        model = str(agent.get("direct_model") or "").strip()
        if model:
            return model
    return settings.direct_default_model


def resolve_direct_api_base(agent: dict[str, Any] | None) -> str:
    """Resolve direct API base from agent overrides or global default."""
    if isinstance(agent, dict):
        base = str(agent.get("direct_api_base") or "").strip()
        if base:
            return base.rstrip("/")
    return settings.openai_api_base.rstrip("/")


def load_workspace_soul_md(workspace: str | None) -> str | None:
    """Best-effort SOUL.md loading from an agent workspace."""
    if not workspace:
        return None

    soul_path = Path(workspace) / "SOUL.md"
    if not soul_path.exists() or not soul_path.is_file():
        return None

    try:
        text = soul_path.read_text(encoding="utf-8").strip()
    except Exception:
        return None

    if not text:
        return None

    if len(text) > MAX_SOUL_MD_CHARS:
        return text[:MAX_SOUL_MD_CHARS].rstrip()
    return text


def prepend_workspace_soul(
    messages: list[dict[str, str]],
    workspace: str | None,
) -> list[dict[str, str]]:
    """Prepend SOUL.md as a leading system message when available."""
    soul_md = load_workspace_soul_md(workspace)
    if not soul_md:
        return list(messages)
    return [{"role": "system", "content": soul_md}, *messages]


def normalize_messages_for_direct(messages: list[dict]) -> list[dict[str, str]]:
    """Filter and normalize message rows for OpenAI-compatible payloads."""
    normalized: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"}:
            continue
        if not isinstance(content, str):
            continue
        normalized.append({"role": role, "content": content})
    return normalized


class DirectLLMClient:
    """Minimal OpenAI-compatible chat client for direct mode."""

    def __init__(
        self,
        *,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.api_base = (api_base or settings.openai_api_base).rstrip("/")
        self.api_key = api_key or settings.openai_api_key

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for direct chat mode")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat_completion(
        self,
        *,
        model: str,
        messages: list[dict],
        user_tag: str | None = None,
        temperature: float | None = None,
        timeout_s: float = 60.0,
        max_tokens: int | None = None,
        tools: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Run a non-stream direct completion and return response JSON."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        if user_tag:
            payload["user"] = user_tag
        if temperature is not None:
            payload["temperature"] = float(temperature)
        if max_tokens is not None:
            payload["max_tokens"] = int(max_tokens)
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        if not isinstance(data, dict):
            raise ValueError("Invalid direct LLM response payload")
        return data

    async def stream_chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        user_tag: str | None = None,
        temperature: float | None = None,
        timeout_s: float = 120.0,
        max_tokens: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield parsed SSE payload rows from a streaming direct completion."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if user_tag:
            payload["user"] = user_tag
        if temperature is not None:
            payload["temperature"] = float(temperature)
        if max_tokens is not None:
            payload["max_tokens"] = int(max_tokens)

        async with httpx.AsyncClient(timeout=timeout_s) as client:
            async with client.stream(
                "POST",
                f"{self.api_base}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data_str = line[6:].strip()
                    if not data_str or data_str == "[DONE]":
                        continue

                    try:
                        payload_row = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    if isinstance(payload_row, dict):
                        yield payload_row
