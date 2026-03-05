"""Shared helpers for parsing OpenAI-compatible LLM responses."""
from __future__ import annotations

from typing import Any


def extract_content(payload: dict[str, Any]) -> str:
    """Extract stripped text content from the first chat completion choice."""
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
