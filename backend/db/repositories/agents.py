"""Agent repository for database operations."""
import json
from db.connection import get_db


class AgentRepository:

    DEFAULT_EMOTIONAL_PROFILE = {
        "mood_decay_rate": 0.3,
        "mood_baseline": {
            "supportive": 5.0,
            "whimsical": 3.0,
            "zen": 3.0,
            "bashful": 2.0,
            "vulnerable": 2.0,
            "flirty": 2.0,
            "euphoric": 2.0,
            "sassy": 1.5,
            "sarcastic": 1.0,
            "snarky": 1.0,
            "melancholic": 1.0,
            "suspicious": 1.0,
            "defiant": 0.5,
            "erratic": 0.5,
            "seductive": 0.5,
            "enraged": 0.2,
        },
        "trust_gain_multiplier": 1.0,
        "trust_loss_multiplier": 1.0,
        "valence_gain_multiplier": 0.95,
        "valence_loss_multiplier": 1.1,
        "bond_gain_multiplier": 0.95,
        "bond_loss_multiplier": 1.1,
        "mood_gain_multiplier": 0.9,
        "mood_loss_multiplier": 1.1,
        "trigger_multipliers": {},
        "trigger_responses": {},
        "description": "Generic companion baseline.",
        "essence_floors": {},
        "essence_ceilings": {},
    }

    @staticmethod
    def parse_profile(raw: str | None) -> dict:
        """Parse emotional_profile JSON safely."""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

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
        workspace: str | None = None,
        emotional_profile: str | None = None,
    ) -> dict:
        if emotional_profile is None:
            emotional_profile = json.dumps(AgentRepository.DEFAULT_EMOTIONAL_PROFILE)
        with get_db() as conn:
            conn.execute(
                "INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (agent_id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
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

    @staticmethod
    def delete(agent_id: str) -> int:
        with get_db() as conn:
            # Explicitly remove session tree first so cleanup is robust
            # even if a caller uses a connection without FK pragmas.
            conn.execute(
                """DELETE FROM messages
                   WHERE session_id IN (SELECT id FROM sessions WHERE agent_id = ?)""",
                (agent_id,),
            )
            conn.execute(
                """DELETE FROM session_participants
                   WHERE session_id IN (SELECT id FROM sessions WHERE agent_id = ?)""",
                (agent_id,),
            )
            conn.execute("DELETE FROM sessions WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM user_agents WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM emotional_state WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM emotional_events_v2 WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM trigger_counts WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM game_stats WHERE agent_id = ?", (agent_id,))
            cur = conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
            return cur.rowcount
