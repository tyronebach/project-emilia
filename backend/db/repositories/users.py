"""
User repository for database operations.
"""
from typing import Optional
from db.connection import get_db


class UserRepository:
    """Repository for user database operations."""

    @staticmethod
    def get_all() -> list[dict]:
        """Get all users."""
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM users ORDER BY display_name"
            ).fetchall()

    @staticmethod
    def get_by_id(user_id: str) -> Optional[dict]:
        """Get user by ID."""
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()

    @staticmethod
    def create(user_id: str, display_name: str, preferences: str = "{}") -> dict:
        """Create a new user."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name, preferences) VALUES (?, ?, ?)",
                (user_id, display_name, preferences)
            )
        return UserRepository.get_by_id(user_id)

    @staticmethod
    def get_agents(user_id: str) -> list[dict]:
        """Get all agents accessible to user."""
        with get_db() as conn:
            return conn.execute("""
                SELECT a.* FROM agents a
                JOIN user_agents ua ON a.id = ua.agent_id
                WHERE ua.user_id = ?
                ORDER BY a.display_name
            """, (user_id,)).fetchall()

    @staticmethod
    def add_agent_access(user_id: str, agent_id: str):
        """Grant user access to an agent."""
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id)
            )

    @staticmethod
    def can_access_agent(user_id: str, agent_id: str) -> bool:
        """Check if user has access to agent."""
        with get_db() as conn:
            result = conn.execute(
                "SELECT 1 FROM user_agents WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()
            return result is not None
