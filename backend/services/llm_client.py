"""Shared Clawdbot chat completion helpers."""
from __future__ import annotations

from typing import Any

import httpx

from config import settings


def _extract_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Invalid LLM response payload: missing choices")

    first = choices[0]
    if not isinstance(first, dict):
        raise ValueError("Invalid LLM response payload: malformed choice")

    message = first.get("message")
    if not isinstance(message, dict):
        raise ValueError("Invalid LLM response payload: missing message")

    content = message.get("content")
    if not isinstance(content, str):
        raise ValueError("Invalid LLM response payload: missing content")

    text = content.strip()
    if not text:
        raise ValueError("LLM response content is empty")
    return text


async def chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    user_tag: str,
    temperature: float | None = None,
    timeout_s: float = 60.0,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Run a non-streaming chat completion against the Clawdbot gateway."""
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "user": user_tag,
    }
    if temperature is not None:
        payload["temperature"] = float(temperature)
    if max_tokens is not None:
        payload["max_tokens"] = int(max_tokens)

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        response = await client.post(
            f"{settings.clawdbot_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.clawdbot_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        return response.json()


async def chat_completion_text(
    *,
    model: str,
    messages: list[dict[str, str]],
    user_tag: str,
    temperature: float | None = None,
    timeout_s: float = 60.0,
    max_tokens: int | None = None,
) -> str:
    """Run a completion and return stripped text content."""
    result = await chat_completion(
        model=model,
        messages=messages,
        user_tag=user_tag,
        temperature=temperature,
        timeout_s=timeout_s,
        max_tokens=max_tokens,
    )
    return _extract_content(result)
