"""Session history compaction via LLM summarization."""
# Phase 3.1 COMPLETE - 2026-02-08
import logging
from pathlib import Path
from typing import Any

from config import settings
from services.direct_llm import load_canon_soul_md
from services.direct_llm import DirectLLMClient
from services.observability import log_metric

logger = logging.getLogger(__name__)

SUMMARIZE_SYSTEM_PROMPT = (
    "Summarize this conversation concisely. Focus on: key topics discussed, "
    "decisions made, user preferences revealed, and any ongoing tasks. "
    "Be factual and neutral. Output only the summary, no preamble."
)


def _persona_compaction_prompt(
    *,
    agent_name: str,
    canon_excerpt: str,
) -> str:
    texture_limit = max(1, settings.compaction_texture_max_lines)
    thread_limit = max(1, settings.compaction_open_threads_max)
    canon_block = canon_excerpt.strip() if canon_excerpt else "(No canon excerpt.)"
    return "\n".join([
        f"You are summarizing from {agent_name}'s perspective.",
        "Preserve factual accuracy and avoid inventing details.",
        "Use this exact output format with section headers:",
        "### Facts",
        "- ...",
        "### Emotional Texture (Agent Perspective)",
        f"- Up to {texture_limit} bullets about what felt meaningful/tense.",
        "### Open Threads",
        f"- Up to {thread_limit} unresolved items.",
        "### Stable User Preferences",
        "- durable preferences only.",
        "If unknown, leave section with a single '- none'.",
        "Canon excerpt:",
        canon_block,
    ])


def _is_structured_summary_valid(summary: str) -> bool:
    text = (summary or "").strip()
    if not text:
        return False
    required_headers = (
        "### Facts",
        "### Emotional Texture (Agent Perspective)",
        "### Open Threads",
        "### Stable User Preferences",
    )
    if not all(header in text for header in required_headers):
        return False

    facts_idx = text.find("### Facts")
    next_idx = text.find("### Emotional Texture (Agent Perspective)")
    if facts_idx < 0 or next_idx <= facts_idx:
        return False
    facts_body = text[facts_idx:next_idx]
    return "- " in facts_body


def _resolve_compaction_mode(room_type: str | None) -> str:
    mode = settings.compaction_persona_mode
    if mode == "off":
        return "off"
    if mode == "all":
        return "persona"
    if mode == "dm_only" and (room_type or "").lower() == "dm":
        return "persona"
    return "off"


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
    async def summarize_messages(
        messages: list[dict],
        *,
        room_type: str | None = None,
        agent_name: str | None = None,
        agent_workspace: str | None = None,
    ) -> str:
        """Summarize a list of chat messages into a concise summary.

        NOTE: This is intentionally a **direct** LLM call (not OpenClaw gateway).
        Compaction should be stateless and must not create/reuse OpenClaw sessions,
        especially with multi-room chat.
        """
        mode = _resolve_compaction_mode(room_type)
        system_prompt = SUMMARIZE_SYSTEM_PROMPT
        if mode == "persona":
            canon_excerpt = ""
            if agent_workspace:
                canon_excerpt = load_canon_soul_md(agent_workspace) or ""
                if len(canon_excerpt) > 2500:
                    canon_excerpt = canon_excerpt[:2500].rstrip()
            system_prompt = _persona_compaction_prompt(
                agent_name=agent_name or "the agent",
                canon_excerpt=canon_excerpt,
            )

        llm_messages = [
            {"role": "system", "content": system_prompt},
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

        if mode == "persona" and not _is_structured_summary_valid(summary):
            fallback_result = await client.chat_completion(
                model=settings.compact_model,
                messages=[{"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT}, *messages],
                temperature=0.0,
                max_tokens=700,
                timeout_s=60.0,
            )
            summary = _extract_content(fallback_result)

        logger.info("Compaction summary generated: %d chars", len(summary))
        log_metric(
            logger,
            "compaction",
            room_type=room_type,
            mode=mode,
            input_messages=len(messages),
            output_chars=len(summary),
            texture_lines=summary.count("\n- ") if mode == "persona" else 0,
        )
        return summary
