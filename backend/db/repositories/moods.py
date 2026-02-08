"""Mood repository for database operations."""
import json
from db.connection import get_db


class MoodRepository:

    @staticmethod
    def get_all() -> list[dict]:
        with get_db() as conn:
            return conn.execute("SELECT * FROM moods ORDER BY id").fetchall()

    @staticmethod
    def get_by_id(mood_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM moods WHERE id = ?", (mood_id,)
            ).fetchone()

    @staticmethod
    def create(mood_id: str, valence: float, arousal: float,
               description: str = "", emoji: str = "", category: str = "neutral") -> dict:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO moods (id, description, valence, arousal, emoji, category) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (mood_id, description, valence, arousal, emoji, category)
            )
            return conn.execute("SELECT * FROM moods WHERE id = ?", (mood_id,)).fetchone()

    @staticmethod
    def update(mood_id: str, updates: dict) -> dict | None:
        allowed = {"description", "valence", "arousal", "emoji", "category"}
        set_clauses = []
        params = []
        for key, value in updates.items():
            if key in allowed:
                set_clauses.append(f"{key} = ?")
                params.append(value)

        if not set_clauses:
            return MoodRepository.get_by_id(mood_id)

        params.append(mood_id)
        with get_db() as conn:
            conn.execute(
                f"UPDATE moods SET {', '.join(set_clauses)} WHERE id = ?", params
            )
            return conn.execute("SELECT * FROM moods WHERE id = ?", (mood_id,)).fetchone()

    @staticmethod
    def delete(mood_id: str) -> int:
        with get_db() as conn:
            cur = conn.execute("DELETE FROM moods WHERE id = ?", (mood_id,))
            return cur.rowcount
