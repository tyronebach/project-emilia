"""Dream runtime: executes reflection jobs for one user/agent pair."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import settings
from db.connection import get_db
from db.repositories import AgentRepository, EmotionalStateRepository
from services.memory.search import search as memory_search
from services.observability import log_metric
from services.providers.native import NativeProvider
from services.providers.registry import get_provider
from services.soul_parser import extract_canon_text

logger = logging.getLogger(__name__)

MAX_SUMMARY_CHARS = 1800


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_canon(agent: dict[str, Any]) -> str:
    workspace = str(agent.get("workspace") or "").strip()
    if not workspace:
        return ""
    soul_path = Path(workspace) / "SOUL.md"
    if not soul_path.exists() or not soul_path.is_file():
        return ""
    try:
        soul_md = soul_path.read_text(encoding="utf-8")
    except OSError:
        return ""
    return extract_canon_text(soul_md)


def _load_lived_experience(user_id: str, agent_id: str) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute(
            """SELECT agent_id, user_id, lived_experience, last_dream_at, dream_count
               FROM character_lived_experience
               WHERE agent_id = ? AND user_id = ?""",
            (agent_id, user_id),
        ).fetchone()
        if row:
            return row
        conn.execute(
            """INSERT INTO character_lived_experience (agent_id, user_id, lived_experience)
               VALUES (?, ?, '')""",
            (agent_id, user_id),
        )
        return conn.execute(
            """SELECT agent_id, user_id, lived_experience, last_dream_at, dream_count
               FROM character_lived_experience
               WHERE agent_id = ? AND user_id = ?""",
            (agent_id, user_id),
        ).fetchone()


def _load_relationship_state(user_id: str, agent_id: str) -> dict[str, float]:
    row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    return {
        "trust": float(row.get("trust") or 0.5),
        "attachment": float(row.get("attachment") or 0.3),
        "intimacy": float(row.get("intimacy") or 0.2),
        "familiarity": float(row.get("familiarity") or 0.0),
    }


def _pair_rooms(user_id: str, agent_id: str) -> list[str]:
    with get_db() as conn:
        rows = conn.execute(
            """SELECT DISTINCT ra.room_id
               FROM room_agents ra
               JOIN room_participants rp ON rp.room_id = ra.room_id
               WHERE ra.agent_id = ? AND rp.user_id = ?""",
            (agent_id, user_id),
        ).fetchall()
    return [str(row["room_id"]) for row in rows]


def _build_conversation_summary(user_id: str, agent_id: str, *, limit_messages: int) -> tuple[str, int]:
    room_ids = _pair_rooms(user_id, agent_id)
    if not room_ids:
        return "", 0

    placeholders = ", ".join("?" for _ in room_ids)
    params: list[Any] = [*room_ids, user_id, agent_id]
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT sender_type, sender_id, content, timestamp
                FROM room_messages
                WHERE room_id IN ({placeholders})
                  AND sender_id IN (?, ?)
                ORDER BY timestamp DESC
                                LIMIT ?""",
                        [*params, max(1, int(limit_messages))],
        ).fetchall()

    ordered = list(reversed(rows))
    lines = []
    for row in ordered:
        speaker = "User" if row.get("sender_id") == user_id else "Agent"
        content = str(row.get("content") or "").strip().replace("\n", " ")
        if content:
            lines.append(f"{speaker}: {content}")
    summary = "\n".join(lines).strip()
    if len(summary) > MAX_SUMMARY_CHARS:
        summary = summary[:MAX_SUMMARY_CHARS].rstrip()
    return summary, len(ordered)


def _build_room_summary_context(user_id: str, agent_id: str) -> str:
    if not settings.dream_include_room_summary:
        return ""
    room_ids = _pair_rooms(user_id, agent_id)
    if not room_ids:
        return ""
    placeholders = ", ".join("?" for _ in room_ids)
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT id, summary
                FROM rooms
                WHERE id IN ({placeholders})
                  AND summary IS NOT NULL
                  AND TRIM(summary) != ''
                ORDER BY summary_updated_at DESC
                LIMIT 3""",
            room_ids,
        ).fetchall()
    blocks: list[str] = []
    for row in rows:
        text = str(row.get("summary") or "").strip()
        if text:
            blocks.append(f"- room {row.get('id')}: {text[:350]}")
    return "\n".join(blocks)


async def _build_memory_context(
    *,
    query: str,
    agent_id: str,
    user_id: str,
    workspace: str | None,
) -> tuple[str, int]:
    if not settings.dream_include_memory_hits:
        return "", 0
    try:
        hits = await memory_search(
            query=query,
            agent_id=agent_id,
            user_id=user_id,
            workspace=workspace,
            top_k=max(1, settings.dream_memory_hits_max),
            min_score=0.4,
        )
    except Exception as exc:
        logger.warning(
            "Dream memory context search unavailable for %s/%s: %s",
            user_id,
            agent_id,
            exc,
        )
        return "", 0
    if not hits:
        return "", 0
    lines = []
    for hit in hits[: settings.dream_memory_hits_max]:
        snippet = " ".join(str(hit.get("snippet") or "").split())
        if len(snippet) > 180:
            snippet = snippet[:180].rstrip() + "..."
        lines.append(f"- [{hit.get('path')}] {snippet}")
    return "\n".join(lines), len(lines)


def _negative_cooldown_active(user_id: str, agent_id: str) -> bool:
    cooldown_hours = max(0, int(settings.dream_negative_event_cooldown_hours))
    if cooldown_hours <= 0:
        return False
    cutoff_ts = datetime.now(timezone.utc).timestamp() - (cooldown_hours * 3600)
    with get_db() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS cnt
               FROM dream_log
               WHERE user_id = ? AND agent_id = ?
                 AND created_at >= ?
                 AND (trust_delta < 0 OR attachment_delta < 0 OR intimacy_delta < 0)""",
            (user_id, agent_id, cutoff_ts),
        ).fetchone()
    return int((row or {}).get("cnt") or 0) > 0


def _extract_content(result: dict[str, Any]) -> str:
    choices = result.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _parse_json_response(raw_content: str) -> dict[str, Any]:
    text = (raw_content or "").strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= start:
        text = text[start:end + 1]
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Dream response was not a JSON object")
    return parsed


def _bound_delta(value: Any, minimum: float, maximum: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.0
    return max(minimum, min(maximum, numeric))


async def _call_dream_llm(
    *,
    agent: dict[str, Any],
    user_id: str,
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    provider = get_provider(agent)
    if isinstance(provider, NativeProvider):
        client = provider._client()
        return await client.chat_completion(
            model=provider._resolve_model(),
            messages=messages,
            user_tag=f"emilia:dream:{agent.get('id')}:{user_id}",
            timeout_s=60.0,
        )

    return await provider.generate(
        messages,
        workspace=None,
        agent_id=str(agent.get("id") or ""),
        user_id=user_id,
        user_tag=f"emilia:dream:{agent.get('id')}:{user_id}",
        timeout_s=60.0,
        include_behavior_format=False,
        use_tools=False,
    )


async def execute_dream(user_id: str, agent_id: str, triggered_by: str = "scheduler") -> dict:
    """Run a dream reflection job for the given user/agent pair."""
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise ValueError(f"Unknown agent: {agent_id}")

    canon = _load_canon(agent)
    lived_row = _load_lived_experience(user_id, agent_id)
    lived_before = str(lived_row.get("lived_experience") or "")
    relationship_before = _load_relationship_state(user_id, agent_id)
    conversation_summary, message_count = _build_conversation_summary(
        user_id,
        agent_id,
        limit_messages=settings.dream_context_max_messages,
    )
    room_summary_context = _build_room_summary_context(user_id, agent_id)
    workspace = str(agent.get("workspace") or "").strip() or None
    memory_context, memory_hits_count = await _build_memory_context(
        query=conversation_summary or lived_before or "relationship",
        agent_id=agent_id,
        user_id=user_id,
        workspace=workspace,
    )
    display_name = str(agent.get("display_name") or agent_id)

    input_context_meta = {
        "message_count": message_count,
        "used_summary": bool(room_summary_context),
        "memory_hits": memory_hits_count,
    }

    prompt = "\n\n".join([
        f"You are {display_name}. Here is your identity:",
        "## Canon (who you fundamentally are — do not contradict this)",
        canon or "(No canon provided.)",
        "## Lived Experience (your accumulated experience — you may update this)",
        lived_before or "(Empty.)",
        f"## Recent Interactions with {user_id}",
        conversation_summary or "(No recent interactions found.)",
        "## Prior Room Summaries",
        room_summary_context or "(No room summaries available.)",
        "## Memory Recollections",
        memory_context or "(No memory hits.)",
        "## Current Relationship State",
        (
            f"Trust: {relationship_before['trust']:.2f} | "
            f"Attachment: {relationship_before['attachment']:.2f} | "
            f"Familiarity: {relationship_before['familiarity']:.2f} | "
            f"Intimacy: {relationship_before['intimacy']:.2f}"
        ),
        (
            "You are in deep reflection. Consider how this person has treated you over time, "
            "what emotional patterns persist, and what should remain top-of-mind next time."
        ),
        (
            "Respond with JSON only: "
            '{"lived_experience_update": "...", '
            '"relationship_adjustments": {"trust_delta": 0.0, "attachment_delta": 0.0, "intimacy_delta": 0.0}, '
            '"internal_monologue": "...", "salient_threads": ["..."], "confidence": 0.0}'
        ),
    ])
    result = await _call_dream_llm(
        agent=agent,
        user_id=user_id,
        messages=[{"role": "system", "content": prompt}],
    )
    parsed = _parse_json_response(_extract_content(result))
    adjustments = parsed.get("relationship_adjustments")
    if not isinstance(adjustments, dict):
        adjustments = {}

    trust_delta = _bound_delta(adjustments.get("trust_delta"), -0.2, 0.2)
    attachment_delta = _bound_delta(adjustments.get("attachment_delta"), -0.1, 0.1)
    intimacy_delta = _bound_delta(adjustments.get("intimacy_delta"), -0.1, 0.1)
    safety_flags: dict[str, Any] = {}
    if _negative_cooldown_active(user_id, agent_id):
        trust_delta = max(trust_delta, -0.05)
        attachment_delta = max(attachment_delta, -0.03)
        intimacy_delta = max(intimacy_delta, -0.03)
        safety_flags["negative_cooldown_applied"] = True

    lived_after = str(parsed.get("lived_experience_update") or "").strip()[: settings.dream_lived_experience_max_chars]
    internal_monologue = str(parsed.get("internal_monologue") or "").strip()

    relationship_after = {
        "trust": max(0.0, min(1.0, relationship_before["trust"] + trust_delta)),
        "attachment": max(0.0, min(1.0, relationship_before["attachment"] + attachment_delta)),
        "intimacy": max(0.0, min(1.0, relationship_before["intimacy"] + intimacy_delta)),
        "familiarity": relationship_before["familiarity"],
    }

    EmotionalStateRepository.update(
        user_id,
        agent_id,
        increment_interaction=False,
        trust=relationship_after["trust"],
        attachment=relationship_after["attachment"],
        intimacy=relationship_after["intimacy"],
    )

    dreamed_at = _utc_now_iso()
    log_id = str(uuid.uuid4())
    model_used = str(result.get("model") or "")
    with get_db() as conn:
        conn.execute(
            """INSERT INTO character_lived_experience (
                   agent_id, user_id, lived_experience, last_dream_at, dream_count
               ) VALUES (?, ?, ?, ?, 1)
               ON CONFLICT(agent_id, user_id) DO UPDATE SET
                   lived_experience = excluded.lived_experience,
                   last_dream_at = excluded.last_dream_at,
                   dream_count = character_lived_experience.dream_count + 1""",
            (agent_id, user_id, lived_after, dreamed_at),
        )
        conn.execute(
            """INSERT INTO dream_log (
                   id, user_id, agent_id, triggered_by, prompt_used, output_json,
                   trust_delta, attachment_delta, intimacy_delta, created_at,
                   dreamed_at, conversation_summary,
                   lived_experience_before, lived_experience_after,
                   relationship_before, relationship_after, internal_monologue, model_used,
                   input_context_meta, safety_flags
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                log_id,
                user_id,
                agent_id,
                triggered_by,
                prompt,
                json.dumps(parsed),
                trust_delta,
                attachment_delta,
                intimacy_delta,
                dreamed_at,
                conversation_summary,
                lived_before,
                lived_after,
                json.dumps(relationship_before),
                json.dumps(relationship_after),
                internal_monologue,
                model_used,
                json.dumps(input_context_meta),
                json.dumps(safety_flags),
            ),
        )
        row = conn.execute("SELECT * FROM dream_log WHERE id = ?", (log_id,)).fetchone()

    if not row:
        raise RuntimeError("Dream log row was not persisted")

    log_metric(
        logger,
        "dream",
        agent_id=agent_id,
        user_id=user_id,
        triggered_by=triggered_by,
        message_count=message_count,
        used_summary=bool(room_summary_context),
        memory_hits=memory_hits_count,
        lived_chars=len(lived_after),
    )
    return row
