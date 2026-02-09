"""Session repository for database operations."""
# Phase 3.1 COMPLETE - 2026-02-08
import uuid
import time
from datetime import datetime, timezone
from db.connection import get_db


class SessionRepository:

    @staticmethod
    def get_by_id(session_id: str) -> dict | None:
        with get_db() as conn:
            session = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if session:
                participants = conn.execute(
                    "SELECT user_id FROM session_participants WHERE session_id = ?",
                    (session_id,)
                ).fetchall()
                session["participants"] = [p["user_id"] for p in participants]
            return session

    @staticmethod
    def get_for_user(user_id: str, agent_id: str | None = None) -> list[dict]:
        with get_db() as conn:
            if agent_id:
                sessions = conn.execute("""
                    SELECT s.* FROM sessions s
                    JOIN session_participants sp ON s.id = sp.session_id
                    WHERE sp.user_id = ? AND s.agent_id = ?
                    ORDER BY s.last_used DESC
                """, (user_id, agent_id)).fetchall()
            else:
                sessions = conn.execute("""
                    SELECT s.* FROM sessions s
                    JOIN session_participants sp ON s.id = sp.session_id
                    WHERE sp.user_id = ?
                    ORDER BY s.last_used DESC
                """, (user_id,)).fetchall()

            if not sessions:
                return sessions

            # Batch fetch all participants instead of N+1 queries
            session_ids = [s["id"] for s in sessions]
            placeholders = ",".join("?" * len(session_ids))
            participants = conn.execute(
                f"SELECT session_id, user_id FROM session_participants WHERE session_id IN ({placeholders})",
                session_ids
            ).fetchall()

            by_session: dict[str, list[str]] = {}
            for p in participants:
                by_session.setdefault(p["session_id"], []).append(p["user_id"])

            for session in sessions:
                session["participants"] = by_session.get(session["id"], [])

            return sessions

    @staticmethod
    def create(agent_id: str, user_id: str, name: str | None = None) -> dict:
        session_id = str(uuid.uuid4())
        now = int(time.time())

        with get_db() as conn:
            if not name:
                agent = conn.execute(
                    "SELECT display_name FROM agents WHERE id = ?", (agent_id,)
                ).fetchone()
                agent_name = agent["display_name"] if agent else "Chat"
                name = f"{agent_name} {datetime.now(timezone.utc).strftime('%m.%d.%y')}"

            conn.execute(
                "INSERT INTO sessions (id, agent_id, name, created_at, last_used) VALUES (?, ?, ?, ?, ?)",
                (session_id, agent_id, name, now, now)
            )
            conn.execute(
                "INSERT INTO session_participants (session_id, user_id) VALUES (?, ?)",
                (session_id, user_id)
            )

            session = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            session["participants"] = [user_id]
            return session

    @staticmethod
    def get_or_create_default(user_id: str, agent_id: str) -> dict:
        sessions = SessionRepository.get_for_user(user_id, agent_id)
        if sessions:
            return sessions[0]
        return SessionRepository.create(agent_id, user_id, name="Default")

    @staticmethod
    def update_last_used(session_id: str):
        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET last_used = ? WHERE id = ?",
                (int(time.time()), session_id)
            )

    @staticmethod
    def increment_message_count(session_id: str):
        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
                (session_id,)
            )

    @staticmethod
    def update(session_id: str, name: str | None = None) -> dict | None:
        with get_db() as conn:
            if name is not None:
                conn.execute(
                    "UPDATE sessions SET name = ? WHERE id = ?", (name, session_id)
                )
        return SessionRepository.get_by_id(session_id)

    @staticmethod
    def delete(session_id: str) -> bool:
        """Delete a session. CASCADE handles session_participants."""
        with get_db() as conn:
            result = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            return result.rowcount > 0

    @staticmethod
    def get_all() -> list[dict]:
        with get_db() as conn:
            rows = conn.execute("""
                SELECT s.*, GROUP_CONCAT(sp.user_id) as participants
                FROM sessions s
                LEFT JOIN session_participants sp ON s.id = sp.session_id
                GROUP BY s.id
                ORDER BY s.last_used DESC
            """).fetchall()
            # GROUP_CONCAT returns comma-separated string; convert to list
            result = []
            for row in rows:
                d = dict(row)
                p = d.get("participants")
                d["participants"] = p.split(",") if p else []
                result.append(d)
            return result

    @staticmethod
    def delete_by_agent(agent_id: str) -> int:
        """Delete all sessions for an agent. CASCADE handles participants."""
        with get_db() as conn:
            result = conn.execute("DELETE FROM sessions WHERE agent_id = ?", (agent_id,))
            return result.rowcount

    @staticmethod
    def delete_all() -> int:
        """Delete all sessions. CASCADE handles participants."""
        with get_db() as conn:
            result = conn.execute("DELETE FROM sessions")
            return result.rowcount

    @staticmethod
    def add_participant(session_id: str, user_id: str):
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO session_participants (session_id, user_id) VALUES (?, ?)",
                (session_id, user_id)
            )

    @staticmethod
    def user_can_access(user_id: str, session_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute(
                "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?",
                (session_id, user_id)
            ).fetchone()
            return result is not None

    # --- Session compaction (Phase 3.1) ---

    @staticmethod
    def get_summary(session_id: str) -> str | None:
        """Get the compacted summary for a session."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT summary FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            return row["summary"] if row else None

    @staticmethod
    def update_summary(session_id: str, summary: str):
        """Update the session summary and increment compaction count."""
        with get_db() as conn:
            conn.execute(
                """UPDATE sessions
                   SET summary = ?, summary_updated_at = ?, compaction_count = COALESCE(compaction_count, 0) + 1
                   WHERE id = ?""",
                (summary, int(time.time()), session_id)
            )

    @staticmethod
    def get_message_count(session_id: str) -> int:
        """Get the actual message count from the messages table (not the cached counter).

        Uses COUNT(*) so the result stays accurate after compaction deletes old messages.
        """
        with get_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?", (session_id,)
            ).fetchone()
            return row["cnt"] if row else 0
