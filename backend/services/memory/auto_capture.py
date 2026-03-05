"""Optional backend memory auto-capture for continuity facts."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from services.memory.reader import read
from services.memory.writer import write

_PREFERENCE_RE = re.compile(r"\b(?:i like|i prefer|my favorite|i usually)\b", re.IGNORECASE)
_COMMITMENT_RE = re.compile(r"\b(?:i will|i'm going to|i plan to|remind me)\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b(?:my birthday is|on \d{4}-\d{2}-\d{2}|next week|tomorrow)\b", re.IGNORECASE)


def _today_path() -> str:
    return f"memory/{datetime.now(timezone.utc).date().isoformat()}.md"


def _candidate_facts(user_message: str, agent_response: str) -> list[tuple[str, float]]:
    text = (user_message or "").strip()
    if not text:
        return []

    candidates: list[tuple[str, float]] = []
    if _PREFERENCE_RE.search(text):
        candidates.append((f"- preference: {text}", 0.9))
    if _COMMITMENT_RE.search(text):
        candidates.append((f"- commitment: {text}", 0.85))
    if _DATE_RE.search(text):
        candidates.append((f"- event/date: {text}", 0.88))

    if "remember" in (agent_response or "").lower() and len(text) <= 180:
        candidates.append((f"- note: {text}", 0.82))

    return candidates


async def maybe_autocapture_memory(
    *,
    workspace: str | None,
    agent_id: str,
    user_id: str | None,
    user_message: str,
    agent_response: str,
) -> str | None:
    if not settings.memory_autocapture_enabled:
        return None
    if not workspace:
        return None

    daily_path = _today_path()
    existing = read(workspace, daily_path, truncate=False)
    if existing.startswith("Error:"):
        existing = ""

    candidates = _candidate_facts(user_message, agent_response)
    candidates = [c for c in candidates if c[1] >= settings.memory_autocapture_min_confidence]
    if not candidates:
        return None

    existing_lines = [line.strip() for line in existing.splitlines() if line.strip()]
    existing_count = sum(1 for line in existing_lines if line.startswith("- "))
    remaining = max(0, settings.memory_autocapture_max_items_per_day - existing_count)
    if remaining <= 0:
        return None

    to_write: list[str] = []
    seen_hashes = {
        hashlib.sha256(line.encode("utf-8")).hexdigest()
        for line in existing_lines
    }
    for fact, _confidence in candidates:
        digest = hashlib.sha256(fact.encode("utf-8")).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        to_write.append(fact)
        if len(to_write) >= remaining:
            break

    if not to_write:
        return None

    payload = "\n" + "\n".join(to_write) + "\n"
    return await write(
        workspace=Path(workspace),
        path=daily_path,
        content=payload,
        mode="append",
        agent_id=agent_id,
        user_id=user_id,
    )
