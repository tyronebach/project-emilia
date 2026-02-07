"""User repository for database operations."""
from db.connection import get_db


class UserRepository:

    @staticmethod
    def get_all() -> list[dict]:
        with get_db() as conn:
            return conn.execute("SELECT * FROM users ORDER BY display_name").fetchall()

    @staticmethod
    def get_all_with_agent_count() -> list[dict]:
        with get_db() as conn:
            return conn.execute("""
                SELECT u.*, COUNT(ua.agent_id) as avatar_count
                FROM users u
                LEFT JOIN user_agents ua ON u.id = ua.user_id
                GROUP BY u.id
                ORDER BY u.display_name
            """).fetchall()

    @staticmethod
    def get_by_id(user_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()

    @staticmethod
    def create(user_id: str, display_name: str, preferences: str = "{}") -> dict:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name, preferences) VALUES (?, ?, ?)",
                (user_id, display_name, preferences)
            )
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    @staticmethod
    def update_preferences(user_id: str, preferences: str) -> dict | None:
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET preferences = ? WHERE id = ?", (preferences, user_id)
            )
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    @staticmethod
    def get_agents(user_id: str) -> list[dict]:
        with get_db() as conn:
            return conn.execute("""
                SELECT a.* FROM agents a
                JOIN user_agents ua ON a.id = ua.agent_id
                WHERE ua.user_id = ?
                ORDER BY a.display_name
            """, (user_id,)).fetchall()

    @staticmethod
    def add_agent_access(user_id: str, agent_id: str):
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id)
            )

    @staticmethod
    def can_access_agent(user_id: str, agent_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute(
                "SELECT 1 FROM user_agents WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()
            return result is not None
