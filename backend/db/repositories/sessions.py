"""
Session repository for database operations.
"""
import uuid
import time
from typing import Optional
from db.connection import get_db


class SessionRepository:
    """Repository for session database operations."""

    @staticmethod
    def _generate_id() -> str:
        """Generate a UUID for session."""
        return str(uuid.uuid4())

    @staticmethod
    def get_by_id(session_id: str) -> Optional[dict]:
        """Get session by ID with participants."""
        with get_db() as conn:
            session = conn.execute(
                "SELECT * FROM sessions WHERE id = ?",
                (session_id,)
            ).fetchone()

            if session:
                participants = conn.execute(
                    "SELECT user_id FROM session_participants WHERE session_id = ?",
                    (session_id,)
                ).fetchall()
                session["participants"] = [p["user_id"] for p in participants]

            return session

    @staticmethod
    def get_for_user(user_id: str, agent_id: str = None) -> list[dict]:
        """Get all sessions for a user, optionally filtered by agent."""
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

            # Add participants to each session
            for session in sessions:
                participants = conn.execute(
                    "SELECT user_id FROM session_participants WHERE session_id = ?",
                    (session["id"],)
                ).fetchall()
                session["participants"] = [p["user_id"] for p in participants]

            return sessions

    @staticmethod
    def create(agent_id: str, user_id: str, name: str = None) -> dict:
        """Create a new session."""
        session_id = SessionRepository._generate_id()
        now = int(time.time())

        with get_db() as conn:
            # Create session
            conn.execute(
                "INSERT INTO sessions (id, agent_id, name, created_at, last_used) VALUES (?, ?, ?, ?, ?)",
                (session_id, agent_id, name, now, now)
            )

            # Add creator as participant
            conn.execute(
                "INSERT INTO session_participants (session_id, user_id) VALUES (?, ?)",
                (session_id, user_id)
            )

        return SessionRepository.get_by_id(session_id)

    @staticmethod
    def get_or_create_default(user_id: str, agent_id: str) -> dict:
        """Get user's most recent session for agent, or create one."""
        sessions = SessionRepository.get_for_user(user_id, agent_id)
        if sessions:
            return sessions[0]  # Most recent
        return SessionRepository.create(agent_id, user_id, name="Default")

    @staticmethod
    def update_last_used(session_id: str):
        """Update session last_used timestamp."""
        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET last_used = ? WHERE id = ?",
                (int(time.time()), session_id)
            )

    @staticmethod
    def increment_message_count(session_id: str):
        """Increment session message count."""
        with get_db() as conn:
            conn.execute(
                "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
                (session_id,)
            )

    @staticmethod
    def update(session_id: str, name: str = None) -> Optional[dict]:
        """Update session name."""
        with get_db() as conn:
            if name is not None:
                conn.execute(
                    "UPDATE sessions SET name = ? WHERE id = ?",
                    (name, session_id)
                )
        return SessionRepository.get_by_id(session_id)

    @staticmethod
    def delete(session_id: str) -> bool:
        """Delete a session."""
        with get_db() as conn:
            conn.execute(
                "DELETE FROM session_participants WHERE session_id = ?",
                (session_id,)
            )
            result = conn.execute(
                "DELETE FROM sessions WHERE id = ?",
                (session_id,)
            )
            return result.rowcount > 0

    @staticmethod
    def get_all() -> list[dict]:
        """Get all sessions (admin)."""
        with get_db() as conn:
            return conn.execute("""
                SELECT s.*, GROUP_CONCAT(sp.user_id) as participants
                FROM sessions s
                LEFT JOIN session_participants sp ON s.id = sp.session_id
                GROUP BY s.id
                ORDER BY s.last_used DESC
            """).fetchall()

    @staticmethod
    def delete_by_agent(agent_id: str) -> int:
        """Delete all sessions for an agent, returns count deleted."""
        with get_db() as conn:
            # Get session IDs first
            sessions = conn.execute(
                "SELECT id FROM sessions WHERE agent_id = ?",
                (agent_id,)
            ).fetchall()

            count = 0
            for s in sessions:
                conn.execute(
                    "DELETE FROM session_participants WHERE session_id = ?",
                    (s['id'],)
                )
                conn.execute(
                    "DELETE FROM sessions WHERE id = ?",
                    (s['id'],)
                )
                count += 1

            return count

    @staticmethod
    def add_participant(session_id: str, user_id: str):
        """Add a participant to a session."""
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO session_participants (session_id, user_id) VALUES (?, ?)",
                (session_id, user_id)
            )

    @staticmethod
    def user_can_access(user_id: str, session_id: str) -> bool:
        """Check if user is a participant in session."""
        with get_db() as conn:
            result = conn.execute(
                "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?",
                (session_id, user_id)
            ).fetchone()
            return result is not None
