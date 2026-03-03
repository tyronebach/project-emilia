"""Dream runtime: executes reflection jobs for one user/agent pair."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from db.connection import get_db
from db.repositories import AgentRepository, EmotionalStateRepository
from services.providers.native import NativeProvider
from services.providers.registry import get_provider
from services.soul_parser import extract_canon_text

logger = logging.getLogger(__name__)

MAX_SUMMARY_CHARS = 1800
MAX_LIVED_EXPERIENCE_CHARS = 500


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


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


def _build_conversation_summary(user_id: str, agent_id: str) -> str:
    room_ids = _pair_rooms(user_id, agent_id)
    if not room_ids:
        return ""

    placeholders = ", ".join("?" for _ in room_ids)
    params: list[Any] = [*room_ids, user_id, agent_id]
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT sender_type, sender_id, content, timestamp
                FROM room_messages
                WHERE room_id IN ({placeholders})
                  AND sender_id IN (?, ?)
                ORDER BY timestamp DESC
                LIMIT 20""",
            params,
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
        return summary[:MAX_SUMMARY_CHARS].rstrip()
    return summary


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
    conversation_summary = _build_conversation_summary(user_id, agent_id)
    display_name = str(agent.get("display_name") or agent_id)

    prompt = "\n\n".join([
        f"You are {display_name}. Here is your identity:",
        "## Canon (who you fundamentally are — do not contradict this)",
        canon or "(No canon provided.)",
        "## Lived Experience (your accumulated experience — you may update this)",
        lived_before or "(Empty.)",
        f"## Recent Interactions with {user_id}",
        conversation_summary or "(No recent interactions found.)",
        "## Current Relationship State",
        (
            f"Trust: {relationship_before['trust']:.2f} | "
            f"Attachment: {relationship_before['attachment']:.2f} | "
            f"Familiarity: {relationship_before['familiarity']:.2f} | "
            f"Intimacy: {relationship_before['intimacy']:.2f}"
        ),
        (
            "Reflect on your recent interactions. Consider how this person has treated you, "
            "whether your feelings changed, what you learned about yourself, and any patterns."
        ),
        (
            "Respond with JSON only: "
            '{"lived_experience_update": "...", '
            '"relationship_adjustments": {"trust_delta": 0.0, "attachment_delta": 0.0, "intimacy_delta": 0.0}, '
            '"internal_monologue": "..."}'
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
    lived_after = str(parsed.get("lived_experience_update") or "").strip()[:MAX_LIVED_EXPERIENCE_CHARS]
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
                   relationship_before, relationship_after, internal_monologue, model_used
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), ?, ?, ?, ?, ?, ?, ?, ?)""",
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
            ),
        )
        row = conn.execute("SELECT * FROM dream_log WHERE id = ?", (log_id,)).fetchone()

    if not row:
        raise RuntimeError("Dream log row was not persisted")
    return row
