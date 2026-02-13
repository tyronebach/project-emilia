"""Room repositories for multi-agent group chat."""
import json
import time
import uuid
from db.connection import get_db


DEFAULT_ROOM_SETTINGS = {
    "vrm_display": "hidden",
    "response_style": "mention",
    "max_agents": 5,
    "allow_games": True,
    "compact_enabled": True,
}

_VALID_AGENT_ROLES = {"participant", "moderator", "observer"}
_VALID_RESPONSE_MODES = {"mention", "always", "manual"}


def _normalize_settings(settings: dict | None) -> dict:
    merged = dict(DEFAULT_ROOM_SETTINGS)
    if isinstance(settings, dict):
        merged.update(settings)
    return merged


def _parse_settings(raw: str | None) -> dict:
    if not raw:
        return dict(DEFAULT_ROOM_SETTINGS)
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return dict(DEFAULT_ROOM_SETTINGS)
    if not isinstance(parsed, dict):
        return dict(DEFAULT_ROOM_SETTINGS)
    return _normalize_settings(parsed)


class RoomRepository:

    @staticmethod
    def _hydrate_room(row: dict | None) -> dict | None:
        if not row:
            return None
        hydrated = dict(row)
        hydrated["settings"] = _parse_settings(hydrated.get("settings"))
        return hydrated

    @staticmethod
    def create(
        name: str,
        created_by: str,
        agent_ids: list[str],
        settings: dict | None = None,
        room_type: str = "group",
    ) -> dict:
        room_id = str(uuid.uuid4())
        now = int(time.time())
        unique_agent_ids = [aid for idx, aid in enumerate(agent_ids) if aid and aid not in agent_ids[:idx]]

        with get_db() as conn:
            conn.execute(
                """INSERT INTO rooms
                   (id, name, created_by, created_at, last_activity, room_type, settings)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    room_id,
                    name,
                    created_by,
                    now,
                    now,
                    room_type,
                    json.dumps(_normalize_settings(settings)),
                ),
            )
            conn.execute(
                "INSERT INTO room_participants (room_id, user_id, joined_at, role) VALUES (?, ?, ?, ?)",
                (room_id, created_by, now, "owner"),
            )

            for agent_id in unique_agent_ids:
                conn.execute(
                    """INSERT OR IGNORE INTO room_agents
                       (room_id, agent_id, added_at, added_by, role, response_mode)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (room_id, agent_id, now, created_by, "participant", "mention"),
                )

        room = RoomRepository.get_by_id(room_id)
        if not room:
            raise RuntimeError("Failed to create room")
        return room

    @staticmethod
    def get_by_id(room_id: str) -> dict | None:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
            return RoomRepository._hydrate_room(row)

    @staticmethod
    def get_for_user(user_id: str) -> list[dict]:
        with get_db() as conn:
            rows = conn.execute(
                """SELECT r.*
                   FROM rooms r
                   JOIN room_participants rp ON rp.room_id = r.id
                   WHERE rp.user_id = ?
                   ORDER BY r.last_activity DESC""",
                (user_id,),
            ).fetchall()
            return [RoomRepository._hydrate_room(row) for row in rows]

    @staticmethod
    def user_can_access(user_id: str, room_id: str) -> bool:
        with get_db() as conn:
            row = conn.execute(
                "SELECT 1 FROM room_participants WHERE room_id = ? AND user_id = ?",
                (room_id, user_id),
            ).fetchone()
            return row is not None

    @staticmethod
    def get_agents(room_id: str) -> list[dict]:
        with get_db() as conn:
            return conn.execute(
                """SELECT
                       ra.room_id,
                       ra.agent_id,
                       ra.added_at,
                       ra.added_by,
                       ra.role,
                       ra.response_mode,
                       a.display_name,
                       a.vrm_model,
                       a.voice_id,
                       a.clawdbot_agent_id
                   FROM room_agents ra
                   JOIN agents a ON a.id = ra.agent_id
                   WHERE ra.room_id = ?
                   ORDER BY ra.added_at ASC, a.display_name ASC""",
                (room_id,),
            ).fetchall()

    @staticmethod
    def get_agent(room_id: str, agent_id: str) -> dict | None:
        with get_db() as conn:
            return conn.execute(
                """SELECT
                       ra.room_id,
                       ra.agent_id,
                       ra.added_at,
                       ra.added_by,
                       ra.role,
                       ra.response_mode,
                       a.display_name,
                       a.vrm_model,
                       a.voice_id,
                       a.clawdbot_agent_id
                   FROM room_agents ra
                   JOIN agents a ON a.id = ra.agent_id
                   WHERE ra.room_id = ? AND ra.agent_id = ?""",
                (room_id, agent_id),
            ).fetchone()

    @staticmethod
    def get_participants(room_id: str) -> list[dict]:
        with get_db() as conn:
            return conn.execute(
                """SELECT
                       rp.room_id,
                       rp.user_id,
                       rp.joined_at,
                       rp.role,
                       u.display_name
                   FROM room_participants rp
                   JOIN users u ON u.id = rp.user_id
                   WHERE rp.room_id = ?
                   ORDER BY rp.joined_at ASC, u.display_name ASC""",
                (room_id,),
            ).fetchall()

    @staticmethod
    def add_agent(
        room_id: str,
        agent_id: str,
        added_by: str,
        response_mode: str = "mention",
        role: str = "participant",
    ) -> dict | None:
        now = int(time.time())
        normalized_mode = response_mode if response_mode in _VALID_RESPONSE_MODES else "mention"
        normalized_role = role if role in _VALID_AGENT_ROLES else "participant"

        with get_db() as conn:
            conn.execute(
                """INSERT OR IGNORE INTO room_agents
                   (room_id, agent_id, added_at, added_by, role, response_mode)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (room_id, agent_id, now, added_by, normalized_role, normalized_mode),
            )
        return RoomRepository.get_agent(room_id, agent_id)

    @staticmethod
    def update_agent(
        room_id: str,
        agent_id: str,
        response_mode: str | None = None,
        role: str | None = None,
    ) -> dict | None:
        updates = []
        params: list = []

        if response_mode is not None:
            normalized_mode = response_mode if response_mode in _VALID_RESPONSE_MODES else "mention"
            updates.append("response_mode = ?")
            params.append(normalized_mode)

        if role is not None:
            normalized_role = role if role in _VALID_AGENT_ROLES else "participant"
            updates.append("role = ?")
            params.append(normalized_role)

        if not updates:
            return RoomRepository.get_agent(room_id, agent_id)

        params.extend([room_id, agent_id])

        with get_db() as conn:
            conn.execute(
                f"UPDATE room_agents SET {', '.join(updates)} WHERE room_id = ? AND agent_id = ?",
                params,
            )
        return RoomRepository.get_agent(room_id, agent_id)

    @staticmethod
    def remove_agent(room_id: str, agent_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute(
                "DELETE FROM room_agents WHERE room_id = ? AND agent_id = ?",
                (room_id, agent_id),
            )
            return result.rowcount > 0

    @staticmethod
    def update(room_id: str, name: str | None = None, settings: dict | None = None) -> dict | None:
        updates = []
        params: list = []

        if name is not None:
            updates.append("name = ?")
            params.append(name)

        if settings is not None:
            current = RoomRepository.get_by_id(room_id)
            merged = _normalize_settings({**(current or {}).get("settings", {}), **settings})
            updates.append("settings = ?")
            params.append(json.dumps(merged))

        if not updates:
            return RoomRepository.get_by_id(room_id)

        params.append(room_id)
        with get_db() as conn:
            conn.execute(
                f"UPDATE rooms SET {', '.join(updates)} WHERE id = ?",
                params,
            )
        return RoomRepository.get_by_id(room_id)

    @staticmethod
    def delete(room_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
            return result.rowcount > 0

    @staticmethod
    def update_last_activity(room_id: str) -> None:
        with get_db() as conn:
            conn.execute(
                "UPDATE rooms SET last_activity = ? WHERE id = ?",
                (int(time.time()), room_id),
            )

    @staticmethod
    def increment_message_count(room_id: str) -> None:
        with get_db() as conn:
            conn.execute(
                """UPDATE rooms
                   SET message_count = COALESCE(message_count, 0) + 1,
                       last_activity = ?
                   WHERE id = ?""",
                (int(time.time()), room_id),
            )

    @staticmethod
    def get_summary(room_id: str) -> str | None:
        with get_db() as conn:
            row = conn.execute("SELECT summary FROM rooms WHERE id = ?", (room_id,)).fetchone()
            return row["summary"] if row else None

    @staticmethod
    def update_summary(room_id: str, summary: str) -> None:
        with get_db() as conn:
            conn.execute(
                """UPDATE rooms
                   SET summary = ?,
                       summary_updated_at = ?,
                       compaction_count = COALESCE(compaction_count, 0) + 1
                   WHERE id = ?""",
                (summary, int(time.time()), room_id),
            )

    @staticmethod
    def get_message_count(room_id: str) -> int:
        with get_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM room_messages WHERE room_id = ?",
                (room_id,),
            ).fetchone()
            return row["cnt"] if row else 0


class RoomMessageRepository:

    @staticmethod
    def add(
        room_id: str,
        sender_type: str,
        sender_id: str,
        content: str,
        origin: str = "chat",
        **meta,
    ) -> dict:
        msg_id = str(uuid.uuid4())
        now = time.time()

        with get_db() as conn:
            conn.execute(
                """INSERT INTO room_messages
                   (id, room_id, sender_type, sender_id, content, timestamp, origin,
                    model, processing_ms,
                    usage_prompt_tokens, usage_completion_tokens,
                    behavior_intent, behavior_mood, behavior_mood_intensity,
                    behavior_energy, behavior_move, behavior_game_action)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    msg_id,
                    room_id,
                    sender_type,
                    sender_id,
                    content,
                    now,
                    origin,
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
                ),
            )

        RoomRepository.increment_message_count(room_id)

        return {
            "id": msg_id,
            "room_id": room_id,
            "sender_type": sender_type,
            "sender_id": sender_id,
            "content": content,
            "timestamp": now,
            "origin": origin,
        }

    @staticmethod
    def get_last_n(
        room_id: str,
        n: int,
        include_game_runtime: bool = False,
    ) -> list[dict]:
        where = "WHERE rm.room_id = ?"
        if not include_game_runtime:
            where += " AND COALESCE(rm.origin, '') != 'game_runtime'"

        with get_db() as conn:
            rows = conn.execute(
                f"""SELECT
                       rm.*,
                       CASE
                           WHEN rm.sender_type = 'user' THEN COALESCE(u.display_name, rm.sender_id)
                           ELSE COALESCE(a.display_name, rm.sender_id)
                       END AS sender_name
                   FROM room_messages rm
                   LEFT JOIN users u ON rm.sender_type = 'user' AND u.id = rm.sender_id
                   LEFT JOIN agents a ON rm.sender_type = 'agent' AND a.id = rm.sender_id
                   {where}
                   ORDER BY rm.timestamp DESC
                   LIMIT ?""",
                (room_id, n),
            ).fetchall()
            return list(reversed(rows))

    @staticmethod
    def get_by_room(
        room_id: str,
        limit: int = 50,
        include_game_runtime: bool = False,
    ) -> list[dict]:
        where = "WHERE rm.room_id = ?"
        if not include_game_runtime:
            where += " AND COALESCE(rm.origin, '') != 'game_runtime'"

        with get_db() as conn:
            return conn.execute(
                f"""SELECT * FROM (
                       SELECT
                           rm.*,
                           CASE
                               WHEN rm.sender_type = 'user' THEN COALESCE(u.display_name, rm.sender_id)
                               ELSE COALESCE(a.display_name, rm.sender_id)
                           END AS sender_name
                       FROM room_messages rm
                       LEFT JOIN users u ON rm.sender_type = 'user' AND u.id = rm.sender_id
                       LEFT JOIN agents a ON rm.sender_type = 'agent' AND a.id = rm.sender_id
                       {where}
                       ORDER BY rm.timestamp DESC
                       LIMIT ?
                   )
                   ORDER BY timestamp ASC""",
                (room_id, limit),
            ).fetchall()

    @staticmethod
    def delete_by_id(message_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute("DELETE FROM room_messages WHERE id = ?", (message_id,))
            return result.rowcount > 0

    @staticmethod
    def get_agent_reply_count(
        room_id: str,
        agent_id: str,
        include_game_runtime: bool = False,
    ) -> int:
        where = "WHERE room_id = ? AND sender_type = 'agent' AND sender_id = ?"
        if not include_game_runtime:
            where += " AND COALESCE(origin, '') != 'game_runtime'"

        with get_db() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM room_messages {where}",
                (room_id, agent_id),
            ).fetchone()
            return int(row["cnt"]) if row else 0
