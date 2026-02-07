"""Agent repository for database operations."""
from db.connection import get_db


class AgentRepository:

    @staticmethod
    def get_all() -> list[dict]:
        with get_db() as conn:
            return conn.execute("SELECT * FROM agents ORDER BY display_name").fetchall()

    @staticmethod
    def get_by_id(agent_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()

    @staticmethod
    def create(
        agent_id: str,
        display_name: str,
        clawdbot_agent_id: str,
        vrm_model: str = "emilia.vrm",
        voice_id: str | None = None,
        workspace: str | None = None
    ) -> dict:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (agent_id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace)
            )
            return conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    @staticmethod
    def update(agent_id: str, updates: dict):
        if not updates:
            return

        allowed = {"display_name", "voice_id", "vrm_model", "clawdbot_agent_id", "workspace"}
        set_clauses = []
        params = []
        for key, value in updates.items():
            if key in allowed:
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
        with get_db() as conn:
            return conn.execute("""
                SELECT u.* FROM users u
                JOIN user_agents ua ON u.id = ua.user_id
                WHERE ua.agent_id = ?
            """, (agent_id,)).fetchall()
