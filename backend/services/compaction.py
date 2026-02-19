"""Session history compaction via LLM summarization."""
# Phase 3.1 COMPLETE - 2026-02-08
import logging
from typing import Any

from config import settings
from services.direct_llm import DirectLLMClient

logger = logging.getLogger(__name__)

SUMMARIZE_SYSTEM_PROMPT = (
    "Summarize this conversation concisely. Focus on: key topics discussed, "
    "decisions made, user preferences revealed, and any ongoing tasks. "
    "Be factual and neutral. Output only the summary, no preamble."
)


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


class CompactionService:

    @staticmethod
    async def summarize_messages(messages: list[dict]) -> str:
        """Summarize a list of chat messages into a concise summary.

        NOTE: This is intentionally a **direct** LLM call (not OpenClaw gateway).
        Compaction should be stateless and must not create/reuse OpenClaw sessions,
        especially with multi-room chat.
        """
        llm_messages = [
            {"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT},
            *messages,
        ]

        client = DirectLLMClient(api_base=settings.openai_api_base)
        result = await client.chat_completion(
            model=settings.compact_model,
            messages=llm_messages,
            # no user_tag => stateless (no session persistence)
            temperature=0.0,
            max_tokens=700,
            timeout_s=60.0,
        )
        summary = _extract_content(result)
        logger.info("Compaction summary generated: %d chars", len(summary))
        return summary
