"""Dream scheduler for due user/agent pairs."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone

from db.connection import get_db
from services.dreams.runtime import execute_dream

logger = logging.getLogger(__name__)

_pair_locks: dict[tuple[str, str], asyncio.Lock] = {}
_pair_locks_guard = asyncio.Lock()
_SESSION_GAP_S = 2 * 60 * 60


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _get_active_pairs(*, user_id: str | None = None, agent_id: str | None = None) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    params: list[object] = [cutoff.timestamp()]
    clauses = ["rm.timestamp >= ?"]
    if user_id:
        clauses.append("rp.user_id = ?")
        params.append(user_id)
    if agent_id:
        clauses.append("ra.agent_id = ?")
        params.append(agent_id)

    where = " AND ".join(clauses)
    with get_db() as conn:
        return conn.execute(
            f"""SELECT DISTINCT rp.user_id, ra.agent_id
                FROM room_messages rm
                JOIN room_participants rp ON rp.room_id = rm.room_id
                JOIN room_agents ra ON ra.room_id = rm.room_id
                WHERE {where}""",
            params,
        ).fetchall()


def _pair_timestamps(user_id: str, agent_id: str, *, since_ts: float | None = None) -> list[float]:
    with get_db() as conn:
        clauses = [
            "EXISTS (SELECT 1 FROM room_participants rp WHERE rp.room_id = rm.room_id AND rp.user_id = ?)",
            "EXISTS (SELECT 1 FROM room_agents ra WHERE ra.room_id = rm.room_id AND ra.agent_id = ?)",
            "rm.sender_id IN (?, ?)",
        ]
        params: list[object] = [user_id, agent_id, user_id, agent_id]
        if since_ts is not None:
            clauses.append("rm.timestamp >= ?")
            params.append(since_ts)
        rows = conn.execute(
            f"""SELECT rm.timestamp
                FROM room_messages rm
                WHERE {' AND '.join(clauses)}
                ORDER BY rm.timestamp ASC""",
            params,
        ).fetchall()
    return [float(row["timestamp"]) for row in rows]


def _count_sessions(timestamps: Iterable[float]) -> int:
    count = 0
    previous: float | None = None
    for ts in timestamps:
        if previous is None or ts - previous > _SESSION_GAP_S:
            count += 1
        previous = ts
    return count


def _last_session_bounds(user_id: str, agent_id: str) -> tuple[float, float] | None:
    timestamps = _pair_timestamps(user_id, agent_id)
    if not timestamps:
        return None
    start = timestamps[-1]
    end = timestamps[-1]
    for idx in range(len(timestamps) - 2, -1, -1):
        ts = timestamps[idx]
        if end - ts > _SESSION_GAP_S:
            break
        start = ts
    return start, end


def _last_session_trust_drop(user_id: str, agent_id: str) -> float:
    bounds = _last_session_bounds(user_id, agent_id)
    if not bounds:
        return 0.0
    start, end = bounds
    with get_db() as conn:
        rows = conn.execute(
            """SELECT trust_delta
               FROM emotional_events_v2
               WHERE user_id = ? AND agent_id = ? AND timestamp BETWEEN ? AND ?""",
            (user_id, agent_id, start, end),
        ).fetchall()
    trust_delta = 0.0
    for row in rows:
        try:
            trust_delta += float(row.get("trust_delta") or 0.0)
        except (TypeError, ValueError):
            continue
    return trust_delta


def find_due_dreamers(user_id: str | None = None, agent_id: str | None = None) -> list[dict]:
    """Return (user_id, agent_id) pairs that are due for a dream."""
    due: list[dict] = []
    now = datetime.now(timezone.utc)

    for pair in _get_active_pairs(user_id=user_id, agent_id=agent_id):
        pair_user_id = str(pair["user_id"])
        pair_agent_id = str(pair["agent_id"])
        with get_db() as conn:
            lived_row = conn.execute(
                """SELECT last_dream_at
                   FROM character_lived_experience
                   WHERE agent_id = ? AND user_id = ?""",
                (pair_agent_id, pair_user_id),
            ).fetchone()

        last_dream_at = _parse_iso((lived_row or {}).get("last_dream_at"))
        since_ts = last_dream_at.timestamp() if last_dream_at else None
        sessions_since = _count_sessions(_pair_timestamps(pair_user_id, pair_agent_id, since_ts=since_ts))
        trust_drop = _last_session_trust_drop(pair_user_id, pair_agent_id)

        reason = None
        if trust_drop <= -0.15:
            reason = "event"
        elif sessions_since >= 5:
            reason = "session_count"
        elif last_dream_at is None or now - last_dream_at > timedelta(hours=48):
            reason = "time"

        if reason:
            due.append({
                "user_id": pair_user_id,
                "agent_id": pair_agent_id,
                "trigger_reason": reason,
            })

    return due


async def _get_pair_lock(user_id: str, agent_id: str) -> asyncio.Lock:
    key = (user_id, agent_id)
    async with _pair_locks_guard:
        if key not in _pair_locks:
            _pair_locks[key] = asyncio.Lock()
        return _pair_locks[key]


async def trigger_dream_for_pair(user_id: str, agent_id: str, triggered_by: str) -> dict | None:
    """Async wrapper that executes a dream and logs exceptions."""
    lock = await _get_pair_lock(user_id, agent_id)
    if lock.locked():
        return None
    async with lock:
        try:
            return await execute_dream(user_id, agent_id, triggered_by=triggered_by)
        except Exception:
            logger.exception("Dream execution failed for %s/%s", user_id, agent_id)
            return None


async def check_and_trigger_dreams() -> list[dict]:
    """Find due dreamers and trigger each in turn."""
    due_pairs = find_due_dreamers()
    results: list[dict] = []
    for pair in due_pairs:
        result = await trigger_dream_for_pair(
            pair["user_id"],
            pair["agent_id"],
            triggered_by=pair["trigger_reason"],
        )
        if result:
            results.append(result)
    return results
