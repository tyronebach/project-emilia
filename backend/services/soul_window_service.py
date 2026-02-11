"""Shared Soul Window read-model helpers."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db.connection import get_db
from db.repositories import AgentRepository, EmotionalStateRepository, MoodRepository
from services.soul_parser import parse_soul_markdown
from services.workspace_events import WorkspaceEventsService


def _iso_utc_from_ts(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    if not isinstance(ts, (int, float)):
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _days_since(ts: float | int | None, now_ts: float) -> int | None:
    if ts is None or not isinstance(ts, (int, float)):
        return None
    return max(0, int((now_ts - float(ts)) // 86400))


def trust_label(trust: float) -> str:
    if trust >= 0.8:
        return "trusts you completely"
    if trust >= 0.6:
        return "trusts you deeply"
    if trust >= 0.4:
        return "growing to trust you"
    if trust >= 0.2:
        return "cautiously warming up"
    return "still getting to know you"


def intimacy_label(intimacy: float) -> str:
    if intimacy >= 0.8:
        return "deeply connected"
    if intimacy >= 0.6:
        return "comfortable sharing feelings"
    if intimacy >= 0.4:
        return "opening up to you"
    if intimacy >= 0.2:
        return "friendly but reserved"
    return "keeping some distance"


def familiarity_label(familiarity: float) -> str:
    if familiarity >= 0.8:
        return "knows you very well"
    if familiarity >= 0.6:
        return "knows you well"
    if familiarity >= 0.4:
        return "getting to know you"
    if familiarity >= 0.2:
        return "learning about you"
    return "just met"


def infer_relationship_type(*, trust: float, intimacy: float, familiarity: float) -> str:
    """Heuristic relationship stage for UX hints (not canonical truth)."""
    if intimacy >= 0.75 and trust >= 0.75:
        return "intimate_companion"
    if trust >= 0.65 and familiarity >= 0.60:
        return "trusted_companion"
    if trust >= 0.45:
        return "friend"
    return "acquaintance"


def _mood_meta_map() -> dict[str, dict[str, str]]:
    rows = MoodRepository.get_all()
    result: dict[str, dict[str, str]] = {}
    for row in rows:
        mood_id = row.get("id")
        if not mood_id:
            continue
        result[mood_id] = {
            "emoji": row.get("emoji") or "",
            "description": row.get("description") or "",
        }
    return result


def get_mood_snapshot(user_id: str, agent_id: str) -> dict[str, Any]:
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)
    ranked = sorted(mood_weights.items(), key=lambda x: x[1], reverse=True)
    mood_meta = _mood_meta_map()

    dominant_id, dominant_weight = ("neutral", 0.0)
    if ranked:
        dominant_id, dominant_weight = ranked[0]

    dominant_meta = mood_meta.get(dominant_id, {})
    secondaries = []
    for mood_id, weight in ranked[1:3]:
        meta = mood_meta.get(mood_id, {})
        secondaries.append(
            {
                "id": mood_id,
                "weight": round(float(weight), 3),
                "emoji": meta.get("emoji", ""),
                "description": meta.get("description", ""),
            }
        )

    last_interaction = state_row.get("last_interaction")
    return {
        "user_id": user_id,
        "agent_id": agent_id,
        "dominant_mood": {
            "id": dominant_id,
            "weight": round(float(dominant_weight), 3),
            "emoji": dominant_meta.get("emoji", "😐" if dominant_id == "neutral" else ""),
            "description": dominant_meta.get("description", ""),
        },
        "secondary_moods": secondaries,
        "valence": float(state_row.get("valence") if state_row.get("valence") is not None else 0.0),
        "arousal": float(state_row.get("arousal") if state_row.get("arousal") is not None else 0.0),
        "trust": float(state_row.get("trust") if state_row.get("trust") is not None else 0.5),
        "intimacy": float(state_row.get("intimacy") if state_row.get("intimacy") is not None else 0.2),
        "interaction_count": int(state_row.get("interaction_count") or 0),
        "last_interaction": _iso_utc_from_ts(last_interaction),
    }


def _first_interaction_stats(user_id: str, agent_id: str) -> tuple[float | None, int]:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT MIN(m.timestamp) AS first_ts, COUNT(*) AS msg_count
            FROM messages m
            JOIN sessions s ON s.id = m.session_id
            JOIN session_participants sp ON sp.session_id = s.id
            WHERE sp.user_id = ?
              AND s.agent_id = ?
              AND m.role IN ('user', 'assistant')
              AND COALESCE(m.origin, '') != 'game_runtime'
            """,
            (user_id, agent_id),
        ).fetchone()

    if not row:
        return None, 0
    first_ts = row.get("first_ts")
    msg_count = int(row.get("msg_count") or 0)
    return (float(first_ts) if first_ts is not None else None), msg_count


def get_bond_snapshot(
    user_id: str,
    agent_id: str,
    *,
    workspace: Path | None = None,
) -> dict[str, Any]:
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)
    ranked = sorted(mood_weights.items(), key=lambda x: x[1], reverse=True)
    dominant_moods = [m for m, w in ranked[:3] if w > 0.01]

    trust = float(state_row.get("trust") if state_row.get("trust") is not None else 0.5)
    intimacy = float(state_row.get("intimacy") if state_row.get("intimacy") is not None else 0.2)
    familiarity = float(state_row.get("familiarity") if state_row.get("familiarity") is not None else 0.0)
    attachment = float(state_row.get("attachment") if state_row.get("attachment") is not None else 0.3)
    playfulness_safety = float(
        state_row.get("playfulness_safety") if state_row.get("playfulness_safety") is not None else 0.5
    )
    conflict_tolerance = float(
        state_row.get("conflict_tolerance") if state_row.get("conflict_tolerance") is not None else 0.7
    )

    first_ts, message_count = _first_interaction_stats(user_id, agent_id)
    now_ts = datetime.now(timezone.utc).timestamp()
    days_known = _days_since(first_ts, now_ts) if first_ts is not None else 0

    milestones: list[dict[str, Any]] = []
    if workspace:
        try:
            events = WorkspaceEventsService.get_events(workspace, user_id, agent_id)
            raw_milestones = events.get("milestones") if isinstance(events, dict) else []
            if isinstance(raw_milestones, list):
                milestones = [m for m in raw_milestones if isinstance(m, dict)]
        except Exception:
            milestones = []

    agent = AgentRepository.get_by_id(agent_id)
    agent_name = (agent.get("display_name") or agent_id) if agent else agent_id

    return {
        "user_id": user_id,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "relationship_type": infer_relationship_type(
            trust=trust,
            intimacy=intimacy,
            familiarity=familiarity,
        ),
        "dimensions": {
            "trust": trust,
            "intimacy": intimacy,
            "familiarity": familiarity,
            "attachment": attachment,
            "playfulness_safety": playfulness_safety,
            "conflict_tolerance": conflict_tolerance,
        },
        "labels": {
            "trust": trust_label(trust),
            "intimacy": intimacy_label(intimacy),
            "familiarity": familiarity_label(familiarity),
        },
        "state": {
            "valence": float(state_row.get("valence") if state_row.get("valence") is not None else 0.0),
            "arousal": float(state_row.get("arousal") if state_row.get("arousal") is not None else 0.0),
            "dominant_moods": dominant_moods,
        },
        "stats": {
            "interaction_count": int(state_row.get("interaction_count") or 0),
            "messages_exchanged": message_count,
            "last_interaction": _iso_utc_from_ts(state_row.get("last_interaction")),
            "first_interaction": _iso_utc_from_ts(first_ts),
            "days_known": int(days_known or 0),
        },
        "milestones": milestones,
    }


def get_about_payload(
    agent_id: str,
    *,
    display_name: str,
    workspace: Path | None,
    include_raw: bool = False,
) -> dict[str, Any]:
    sections = {
        "identity": {},
        "essence": [],
        "personality": [],
        "quirks": [],
    }
    raw_soul_md: str | None = None

    if workspace:
        soul_path = workspace / "SOUL.md"
        if soul_path.exists() and soul_path.is_file():
            try:
                raw_soul_md = soul_path.read_text(encoding="utf-8")
                parsed = parse_soul_markdown(raw_soul_md)
                if isinstance(parsed, dict):
                    sections = {
                        "identity": parsed.get("identity") if isinstance(parsed.get("identity"), dict) else {},
                        "essence": parsed.get("essence") if isinstance(parsed.get("essence"), list) else [],
                        "personality": parsed.get("personality") if isinstance(parsed.get("personality"), list) else [],
                        "quirks": parsed.get("quirks") if isinstance(parsed.get("quirks"), list) else [],
                    }
            except Exception:
                sections = {
                    "identity": {},
                    "essence": [],
                    "personality": [],
                    "quirks": [],
                }
                raw_soul_md = None

    return {
        "agent_id": agent_id,
        "display_name": display_name,
        "sections": sections,
        "raw_soul_md": raw_soul_md if include_raw else None,
    }
