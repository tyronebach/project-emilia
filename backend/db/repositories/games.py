"""Game registry and per-agent game configuration repository."""
import time
from db.connection import get_db


class GameRepository:

    @staticmethod
    def list_registry(include_inactive: bool = True) -> list[dict]:
        with get_db() as conn:
            if include_inactive:
                return conn.execute(
                    "SELECT * FROM game_registry ORDER BY display_name"
                ).fetchall()
            return conn.execute(
                "SELECT * FROM game_registry WHERE active = 1 ORDER BY display_name"
            ).fetchall()

    @staticmethod
    def get_registry(game_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM game_registry WHERE id = ?", (game_id,)
            ).fetchone()

    @staticmethod
    def create_registry_game(
        game_id: str,
        display_name: str,
        category: str,
        description: str,
        module_key: str,
        active: bool = True,
        move_provider_default: str = "llm",
        rule_mode: str = "strict",
        prompt_instructions: str | None = None,
        version: str = "1",
    ) -> dict:
        now = int(time.time())
        with get_db() as conn:
            conn.execute(
                """INSERT INTO game_registry
                   (id, display_name, category, description, module_key, active,
                    move_provider_default, rule_mode, prompt_instructions, version,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    game_id,
                    display_name,
                    category,
                    description,
                    module_key,
                    1 if active else 0,
                    move_provider_default,
                    rule_mode,
                    prompt_instructions,
                    version,
                    now,
                    now,
                ),
            )
            return conn.execute(
                "SELECT * FROM game_registry WHERE id = ?", (game_id,)
            ).fetchone()

    @staticmethod
    def update_registry_game(game_id: str, updates: dict) -> dict | None:
        if not updates:
            return GameRepository.get_registry(game_id)

        allowed = {
            "display_name",
            "category",
            "description",
            "module_key",
            "active",
            "move_provider_default",
            "rule_mode",
            "prompt_instructions",
            "version",
        }
        set_clauses = []
        params: list = []
        for key, value in updates.items():
            if key not in allowed:
                continue
            if key == "active" and isinstance(value, bool):
                value = 1 if value else 0
            set_clauses.append(f"{key} = ?")
            params.append(value)

        if not set_clauses:
            return GameRepository.get_registry(game_id)

        set_clauses.append("updated_at = ?")
        params.append(int(time.time()))
        params.append(game_id)

        with get_db() as conn:
            conn.execute(
                f"UPDATE game_registry SET {', '.join(set_clauses)} WHERE id = ?",
                params,
            )
            return conn.execute(
                "SELECT * FROM game_registry WHERE id = ?", (game_id,)
            ).fetchone()

    @staticmethod
    def deactivate_registry_game(game_id: str) -> dict | None:
        return GameRepository.update_registry_game(
            game_id, {"active": 0}
        )

    @staticmethod
    def list_agent_game_configs(agent_id: str, include_inactive: bool = True) -> list[dict]:
        sql = """
            SELECT
                gr.*,
                agc.enabled AS config_enabled,
                agc.mode AS config_mode,
                agc.difficulty AS config_difficulty,
                agc.prompt_override AS config_prompt_override,
                agc.workspace_required AS config_workspace_required,
                COALESCE(agc.enabled, 1) AS effective_enabled,
                COALESCE(agc.mode, gr.rule_mode) AS effective_mode
            FROM game_registry gr
            LEFT JOIN agent_game_config agc
              ON agc.game_id = gr.id AND agc.agent_id = ?
        """
        if include_inactive:
            sql += " ORDER BY gr.display_name"
        else:
            sql += " WHERE gr.active = 1 ORDER BY gr.display_name"

        with get_db() as conn:
            return conn.execute(sql, (agent_id,)).fetchall()

    @staticmethod
    def get_agent_game_config(agent_id: str, game_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                """SELECT * FROM agent_game_config
                   WHERE agent_id = ? AND game_id = ?""",
                (agent_id, game_id),
            ).fetchone()

    @staticmethod
    def upsert_agent_game_config(
        agent_id: str,
        game_id: str,
        enabled: bool | None = None,
        mode: str | None = None,
        difficulty: float | None = None,
        prompt_override: str | None = None,
        workspace_required: bool | None = None,
    ) -> dict:
        current = GameRepository.get_agent_game_config(agent_id, game_id) or {}

        enabled_val = current.get("enabled", 1) if enabled is None else (1 if enabled else 0)
        mode_val = current.get("mode") if mode is None else mode
        difficulty_val = current.get("difficulty") if difficulty is None else difficulty
        prompt_override_val = current.get("prompt_override") if prompt_override is None else prompt_override
        workspace_required_val = (
            current.get("workspace_required", 0)
            if workspace_required is None
            else (1 if workspace_required else 0)
        )

        with get_db() as conn:
            conn.execute(
                """INSERT INTO agent_game_config
                   (agent_id, game_id, enabled, mode, difficulty, prompt_override, workspace_required)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(agent_id, game_id) DO UPDATE SET
                       enabled = excluded.enabled,
                       mode = excluded.mode,
                       difficulty = excluded.difficulty,
                       prompt_override = excluded.prompt_override,
                       workspace_required = excluded.workspace_required""",
                (
                    agent_id,
                    game_id,
                    enabled_val,
                    mode_val,
                    difficulty_val,
                    prompt_override_val,
                    workspace_required_val,
                ),
            )
            return conn.execute(
                """SELECT * FROM agent_game_config
                   WHERE agent_id = ? AND game_id = ?""",
                (agent_id, game_id),
            ).fetchone()

    @staticmethod
    def delete_agent_game_config(agent_id: str, game_id: str) -> int:
        with get_db() as conn:
            cur = conn.execute(
                """DELETE FROM agent_game_config
                   WHERE agent_id = ? AND game_id = ?""",
                (agent_id, game_id),
            )
            return cur.rowcount

    @staticmethod
    def list_effective_games_for_agent(agent_id: str) -> list[dict]:
        with get_db() as conn:
            return conn.execute(
                """
                SELECT
                    gr.*,
                    COALESCE(agc.mode, gr.rule_mode) AS effective_mode,
                    agc.difficulty AS effective_difficulty,
                    agc.prompt_override AS prompt_override
                FROM game_registry gr
                LEFT JOIN agent_game_config agc
                  ON agc.game_id = gr.id AND agc.agent_id = ?
                WHERE gr.active = 1
                  AND COALESCE(agc.enabled, 1) = 1
                ORDER BY gr.display_name
                """,
                (agent_id,),
            ).fetchall()

    @staticmethod
    def get_effective_game_for_agent(agent_id: str, game_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                """
                SELECT
                    gr.*,
                    COALESCE(agc.mode, gr.rule_mode) AS effective_mode,
                    agc.difficulty AS effective_difficulty,
                    agc.prompt_override AS prompt_override
                FROM game_registry gr
                LEFT JOIN agent_game_config agc
                  ON agc.game_id = gr.id AND agc.agent_id = ?
                WHERE gr.id = ?
                  AND gr.active = 1
                  AND COALESCE(agc.enabled, 1) = 1
                """,
                (agent_id, game_id),
            ).fetchone()
