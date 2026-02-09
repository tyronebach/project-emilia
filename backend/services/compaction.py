"""Session history compaction via LLM summarization."""
# Phase 3.1 COMPLETE - 2026-02-08
import logging
import httpx
from config import settings

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

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.compact_model,
                    "messages": llm_messages,
                    "stream": False,
                    "user": "emilia:compaction",
                },
            )
            response.raise_for_status()
            result = response.json()

        summary = result["choices"][0]["message"]["content"].strip()
        logger.info("Compaction summary generated: %d chars", len(summary))
        return summary
