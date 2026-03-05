"""Repository helpers for character_lived_experience records."""
from __future__ import annotations

from db.connection import get_db


class CharacterLivedExperienceRepository:

    @staticmethod
    def get(agent_id: str, user_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                """SELECT agent_id, user_id, lived_experience, last_dream_at, dream_count
                   FROM character_lived_experience
                   WHERE agent_id = ? AND user_id = ?""",
                (agent_id, user_id),
            ).fetchone()

    @staticmethod
    def get_or_create(agent_id: str, user_id: str) -> dict:
        row = CharacterLivedExperienceRepository.get(agent_id, user_id)
        if row:
            return row

        with get_db() as conn:
            conn.execute(
                """INSERT INTO character_lived_experience (agent_id, user_id, lived_experience)
                   VALUES (?, ?, '')""",
                (agent_id, user_id),
            )
        return CharacterLivedExperienceRepository.get(agent_id, user_id) or {}

    @staticmethod
    def get_text(agent_id: str | None, user_id: str | None) -> str:
        if not agent_id or not user_id:
            return ""
        row = CharacterLivedExperienceRepository.get(agent_id, user_id) or {}
        return str(row.get("lived_experience") or "").strip()
