"""Session history compaction via LLM summarization."""
# Phase 3.1 COMPLETE - 2026-02-08
import logging
from config import settings
from services.llm_client import chat_completion_text

logger = logging.getLogger(__name__)

SUMMARIZE_SYSTEM_PROMPT = (
    "Summarize this conversation concisely. Focus on: key topics discussed, "
    "decisions made, user preferences revealed, and any ongoing tasks. "
    "Be factual and neutral. Output only the summary, no preamble."
)


class CompactionService:

    @staticmethod
    async def summarize_messages(messages: list[dict]) -> str:
        """Summarize a list of chat messages into a concise summary.

        Args:
            messages: List of {"role": str, "content": str} dicts.

        Returns:
            Summary string (~200-400 tokens).
        """
        llm_messages = [
            {"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT},
            *messages,
        ]

        summary = await chat_completion_text(
            model=settings.compact_model,
            messages=llm_messages,
            user_tag="emilia:compaction",
            timeout_s=60.0,
        )
        logger.info("Compaction summary generated: %d chars", len(summary))
        return summary
