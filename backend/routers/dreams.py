"""Dream system API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from core.exceptions import not_found
from db.connection import get_db
from db.repositories import AgentRepository, UserRepository
from dependencies import verify_token
from services.dreams.runtime import execute_dream

router = APIRouter(prefix="/api/dreams", tags=["dreams"], dependencies=[Depends(verify_token)])


def _ensure_pair(agent_id: str, user_id: str) -> None:
    if not AgentRepository.get_by_id(agent_id):
        raise not_found("Agent")
    if not UserRepository.get_by_id(user_id):
        raise not_found("User")


@router.get("/{agent_id}/{user_id}")
async def get_dream_status(agent_id: str, user_id: str) -> dict:
    _ensure_pair(agent_id, user_id)
    with get_db() as conn:
        lived = conn.execute(
            """SELECT agent_id, user_id, lived_experience, last_dream_at, dream_count
               FROM character_lived_experience
               WHERE agent_id = ? AND user_id = ?""",
            (agent_id, user_id),
        ).fetchone()
        last_dream = conn.execute(
            """SELECT *
               FROM dream_log
               WHERE agent_id = ? AND user_id = ?
               ORDER BY COALESCE(dreamed_at, created_at) DESC
               LIMIT 1""",
            (agent_id, user_id),
        ).fetchone()
    return {
        "agent_id": agent_id,
        "user_id": user_id,
        "lived_experience": lived or {
            "agent_id": agent_id,
            "user_id": user_id,
            "lived_experience": "",
            "last_dream_at": None,
            "dream_count": 0,
        },
        "last_dream": last_dream,
    }


@router.get("/{agent_id}/{user_id}/log")
async def get_dream_log(agent_id: str, user_id: str) -> dict:
    _ensure_pair(agent_id, user_id)
    with get_db() as conn:
        rows = conn.execute(
            """SELECT *
               FROM dream_log
               WHERE agent_id = ? AND user_id = ?
               ORDER BY COALESCE(dreamed_at, created_at) DESC""",
            (agent_id, user_id),
        ).fetchall()
    return {"dreams": rows, "count": len(rows)}


@router.post("/{agent_id}/{user_id}/trigger")
async def trigger_dream(agent_id: str, user_id: str) -> dict:
    _ensure_pair(agent_id, user_id)
    return await execute_dream(user_id, agent_id, triggered_by="manual")


@router.delete("/{agent_id}/{user_id}/reset")
async def reset_lived_experience(agent_id: str, user_id: str) -> dict:
    _ensure_pair(agent_id, user_id)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO character_lived_experience (
                   agent_id, user_id, lived_experience, last_dream_at, dream_count
               ) VALUES (?, ?, '', NULL, 0)
               ON CONFLICT(agent_id, user_id) DO UPDATE SET
                   lived_experience = '',
                   last_dream_at = NULL,
                   dream_count = 0""",
            (agent_id, user_id),
        )
    return {"status": "ok", "agent_id": agent_id, "user_id": user_id, "lived_experience": ""}
