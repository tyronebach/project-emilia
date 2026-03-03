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
        clawdbot_agent_id: str | None = None,
        vrm_model: str = "emilia.vrm",
        voice_id: str | None = None,
        workspace: str | None = None,
        emotional_profile: str | None = None,
        direct_model: str | None = None,
        direct_api_base: str | None = None,
        provider: str = "native",
        provider_config: dict | None = None,
    ) -> dict:
        if emotional_profile is None:
            emotional_profile = json.dumps(AgentRepository.DEFAULT_EMOTIONAL_PROFILE)

        if isinstance(direct_model, str):
            direct_model = direct_model.strip() or None
        if isinstance(direct_api_base, str):
            direct_api_base = direct_api_base.strip() or None

        normalized_provider = (provider or "native").strip().lower()
        if normalized_provider not in {"native", "openclaw"}:
            normalized_provider = "native"

        config = dict(provider_config) if provider_config else {}
        # Backward compat: store clawdbot_agent_id inside provider_config for openclaw agents.
        if clawdbot_agent_id and normalized_provider == "openclaw":
            config.setdefault("clawdbot_agent_id", clawdbot_agent_id)

        with get_db() as conn:
            conn.execute(
                """INSERT INTO agents
                   (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                    emotional_profile, direct_model, direct_api_base,
                    provider, provider_config)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id,
                    display_name,
                    clawdbot_agent_id,
                    vrm_model,
                    voice_id,
                    workspace,
                    emotional_profile,
                    direct_model,
                    direct_api_base,
                    normalized_provider,
                    json.dumps(config),
                )
            )
            return conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    @staticmethod
    def update(agent_id: str, updates: dict):
        if not updates:
            return

        allowed = {
            "display_name",
            "voice_id",
            "vrm_model",
            "clawdbot_agent_id",
            "workspace",
            "direct_model",
            "direct_api_base",
            "provider",
            "provider_config",
        }
        normalized_updates = dict(updates)

        provider_value = normalized_updates.get("provider")
        if isinstance(provider_value, str):
            provider_value = provider_value.strip().lower()
            if provider_value not in {"native", "openclaw"}:
                provider_value = "native"
            normalized_updates["provider"] = provider_value

        config_value = normalized_updates.get("provider_config")
        if isinstance(config_value, str):
            try:
                parsed_config = json.loads(config_value)
                config_value = parsed_config if isinstance(parsed_config, dict) else {}
            except (json.JSONDecodeError, TypeError):
                config_value = {}
        elif config_value is None:
            config_value = {}
        elif not isinstance(config_value, dict):
            config_value = {}

        clawdbot_agent_id = normalized_updates.get("clawdbot_agent_id")
        if clawdbot_agent_id and normalized_updates.get("provider") == "openclaw":
            config_value = dict(config_value)
            config_value.setdefault("clawdbot_agent_id", clawdbot_agent_id)
            normalized_updates["provider_config"] = config_value

        set_clauses = []
        params = []
        for key, value in normalized_updates.items():
            if key in allowed:
                if key == "provider":
                    value = normalized_updates["provider"]
                elif key == "provider_config":
                    value = json.dumps(value) if isinstance(value, dict) else (value or "{}")
                elif key in {"direct_model", "direct_api_base"} and isinstance(value, str):
                    value = value.strip() or None
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
            # Remove room data for rooms this agent participates in
            room_ids = [
                row["room_id"]
                for row in conn.execute(
                    "SELECT room_id FROM room_agents WHERE agent_id = ?", (agent_id,)
                ).fetchall()
            ]
            for rid in room_ids:
                conn.execute("DELETE FROM room_messages WHERE room_id = ?", (rid,))
                conn.execute("DELETE FROM room_participants WHERE room_id = ?", (rid,))
                conn.execute("DELETE FROM room_agents WHERE room_id = ?", (rid,))
                conn.execute("DELETE FROM rooms WHERE id = ?", (rid,))
            conn.execute("DELETE FROM user_agents WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM emotional_state WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM emotional_events_v2 WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM trigger_counts WHERE agent_id = ?", (agent_id,))
            conn.execute("DELETE FROM game_stats WHERE agent_id = ?", (agent_id,))
            cur = conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
            return cur.rowcount
