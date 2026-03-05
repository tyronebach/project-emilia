"""Optional backend memory auto-capture for continuity facts."""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import settings
from services.direct_llm import DirectLLMClient
from services.memory.reader import read
from services.memory.writer import write

logger = logging.getLogger(__name__)

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_ALLOWED_KINDS = {"preference", "commitment", "date", "profile", "fact"}


def _today_path() -> str:
    return f"memory/{datetime.now(timezone.utc).date().isoformat()}.md"


def _extract_json_text(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""

    fenced = _JSON_FENCE_RE.search(text)
    if fenced:
        return fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1].strip()
    return text


def _normalize_confidence(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return round(value, 4)


def _sanitize_memory_text(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    if len(text) > 180:
        return ""
    return text


async def _candidate_facts_llm(user_message: str, agent_response: str) -> list[tuple[str, float]]:
    text = (user_message or "").strip()
    if not text:
        return []

    system_prompt = (
        "You extract durable user-memory candidates from one chat turn. "
        "Return JSON only with this schema: "
        "{\"items\":[{\"kind\":\"preference|commitment|date|profile|fact\","
        "\"memory\":\"short fact\",\"confidence\":0.0-1.0}]}. "
        "Rules: extract only explicit first-person user facts; do not infer; "
        "handle negation correctly; ignore roleplay/jokes/sarcasm/hypotheticals; "
        "max 4 items; memory text <= 180 chars; if none, return {\"items\":[]}."
    )
    user_prompt = (
        "User message:\n"
        f"{text}\n\n"
        "Assistant response (context only):\n"
        f"{(agent_response or '').strip()}"
    )

    try:
        client = DirectLLMClient()
        result = await client.chat_completion(
            model=settings.memory_autocapture_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            timeout_s=settings.memory_autocapture_timeout_s,
            max_tokens=320,
        )
    except Exception:
        logger.exception("Memory auto-capture extractor call failed")
        return []

    raw_content = ""
    try:
        raw_content = str(result.get("choices", [{}])[0].get("message", {}).get("content") or "")
    except Exception:
        return []

    extracted = _extract_json_text(raw_content)
    if not extracted:
        return []

    try:
        payload = json.loads(extracted)
    except Exception:
        logger.warning("Memory auto-capture extractor returned non-JSON payload")
        return []

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []

    candidates: list[tuple[str, float]] = []
    max_candidates = max(1, int(settings.memory_autocapture_max_candidates))

    for item in items:
        if not isinstance(item, dict):
            continue

        kind = str(item.get("kind") or "fact").strip().lower()
        if kind not in _ALLOWED_KINDS:
            kind = "fact"

        memory_text = _sanitize_memory_text(item.get("memory"))
        if not memory_text:
            continue

        confidence = _normalize_confidence(item.get("confidence"))
        if confidence <= 0.0:
            continue

        candidates.append((f"- {kind}: {memory_text}", confidence))
        if len(candidates) >= max_candidates:
            break

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

    candidates = await _candidate_facts_llm(user_message, agent_response)
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
