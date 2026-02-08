"""Message repository for webapp-managed chat history."""
import uuid
import time
from db.connection import get_db


class MessageRepository:

    @staticmethod
    def get_by_session(session_id: str, limit: int = 50) -> list[dict]:
        """Get messages for session, ordered by timestamp."""
        with get_db() as conn:
            return conn.execute(
                """SELECT id, session_id, role, content, timestamp,
                          model, processing_ms,
                          usage_prompt_tokens, usage_completion_tokens,
                          behavior_intent, behavior_mood, behavior_mood_intensity,
                          behavior_energy, behavior_move, behavior_game_action
                   FROM messages
                   WHERE session_id = ?
                   ORDER BY timestamp ASC
                   LIMIT ?""",
                (session_id, limit)
            ).fetchall()

    @staticmethod
    def get_last_n(session_id: str, n: int) -> list[dict]:
        """Get last N messages for LLM context building."""
        with get_db() as conn:
            rows = conn.execute(
                """SELECT role, content FROM messages
                   WHERE session_id = ?
                   ORDER BY timestamp DESC
                   LIMIT ?""",
                (session_id, n)
            ).fetchall()
            return list(reversed(rows))

    @staticmethod
    def add(session_id: str, role: str, content: str, **meta) -> dict:
        """Store a message. Returns the inserted row as dict."""
        msg_id = str(uuid.uuid4())
        now = time.time()

        with get_db() as conn:
            conn.execute(
                """INSERT INTO messages
                   (id, session_id, role, content, timestamp,
                    model, processing_ms,
                    usage_prompt_tokens, usage_completion_tokens,
                    behavior_intent, behavior_mood, behavior_mood_intensity,
                    behavior_energy, behavior_move, behavior_game_action)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    msg_id, session_id, role, content, now,
                    meta.get("model"),
                    meta.get("processing_ms"),
                    meta.get("usage_prompt_tokens"),
                    meta.get("usage_completion_tokens"),
                    meta.get("behavior_intent"),
                    meta.get("behavior_mood"),
                    meta.get("behavior_mood_intensity"),
                    meta.get("behavior_energy"),
                    meta.get("behavior_move"),
                    meta.get("behavior_game_action"),
                )
            )
            return {
                "id": msg_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "timestamp": now,
            }
