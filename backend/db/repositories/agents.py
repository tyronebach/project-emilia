"""
Agent repository for database operations.
"""
from typing import Optional
from db.connection import get_db


class AgentRepository:
    """Repository for agent database operations."""

    @staticmethod
    def get_all() -> list[dict]:
        """Get all agents."""
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM agents ORDER BY display_name"
            ).fetchall()

    @staticmethod
    def get_by_id(agent_id: str) -> Optional[dict]:
        """Get agent by ID."""
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM agents WHERE id = ?",
                (agent_id,)
            ).fetchone()

    @staticmethod
    def create(
        agent_id: str,
        display_name: str,
        clawdbot_agent_id: str,
        vrm_model: str = "emilia.vrm",
        voice_id: str = None,
        workspace: str = None
    ) -> dict:
        """Create a new agent."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (agent_id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace)
            )
        return AgentRepository.get_by_id(agent_id)

    @staticmethod
    def update(agent_id: str, updates: dict):
        """Update agent fields."""
        if not updates:
            return

        set_clauses = []
        params = []
        for key, value in updates.items():
            if key in ["display_name", "voice_id", "vrm_model", "clawdbot_agent_id", "workspace"]:
                set_clauses.append(f"{key} = ?")
                params.append(value)

        if not set_clauses:
            return

        params.append(agent_id)
        sql = f"UPDATE agents SET {', '.join(set_clauses)} WHERE id = ?"

        with get_db() as conn:
            conn.execute(sql, params)

    @staticmethod
    def get_owners(agent_id: str) -> list[dict]:
        """Get all users who have access to an agent."""
        with get_db() as conn:
            return conn.execute("""
                SELECT u.* FROM users u
                JOIN user_agents ua ON u.id = ua.user_id
                WHERE ua.agent_id = ?
            """, (agent_id,)).fetchall()
