"""Relationship type repository for database operations."""
import json
from db.connection import get_db

# JSON columns that are stored as TEXT in the DB
_JSON_COLUMNS = {"modifiers", "behaviors", "response_modifiers", "trigger_mood_map", "example_responses", "extra"}


def _parse_row(row: dict | None) -> dict | None:
    """Parse JSON text columns back to dicts."""
    if row is None:
        return None
    result = dict(row)
    for col in _JSON_COLUMNS:
        if col in result and isinstance(result[col], str):
            try:
                result[col] = json.loads(result[col])
            except (json.JSONDecodeError, TypeError):
                result[col] = {}
    return result


class RelationshipTypeRepository:

    @staticmethod
    def get_all() -> list[dict]:
        with get_db() as conn:
            rows = conn.execute("SELECT * FROM relationship_types ORDER BY id").fetchall()
        return [_parse_row(r) for r in rows]

    @staticmethod
    def get_by_id(rel_id: str) -> dict | None:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM relationship_types WHERE id = ?", (rel_id,)
            ).fetchone()
        return _parse_row(row)

    @staticmethod
    def create(rel_id: str, description: str = "", modifiers: dict | None = None,
               behaviors: dict | None = None, response_modifiers: dict | None = None,
               trigger_mood_map: dict | None = None, example_responses: dict | None = None,
               extra: dict | None = None) -> dict:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO relationship_types "
                "(id, description, modifiers, behaviors, response_modifiers, trigger_mood_map, example_responses, extra) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    rel_id,
                    description,
                    json.dumps(modifiers or {}),
                    json.dumps(behaviors or {}),
                    json.dumps(response_modifiers or {}),
                    json.dumps(trigger_mood_map or {}),
                    json.dumps(example_responses or {}),
                    json.dumps(extra or {}),
                )
            )
            row = conn.execute("SELECT * FROM relationship_types WHERE id = ?", (rel_id,)).fetchone()
        return _parse_row(row)

    @staticmethod
    def update(rel_id: str, updates: dict) -> dict | None:
        set_clauses = []
        params = []
        allowed_text = {"description"}
        for key, value in updates.items():
            if key in allowed_text:
                set_clauses.append(f"{key} = ?")
                params.append(value)
            elif key in _JSON_COLUMNS:
                set_clauses.append(f"{key} = ?")
                params.append(json.dumps(value) if isinstance(value, (dict, list)) else value)

        if not set_clauses:
            return RelationshipTypeRepository.get_by_id(rel_id)

        params.append(rel_id)
        with get_db() as conn:
            conn.execute(
                f"UPDATE relationship_types SET {', '.join(set_clauses)} WHERE id = ?", params
            )
            row = conn.execute("SELECT * FROM relationship_types WHERE id = ?", (rel_id,)).fetchone()
        return _parse_row(row)

    @staticmethod
    def delete(rel_id: str) -> int:
        with get_db() as conn:
            cur = conn.execute("DELETE FROM relationship_types WHERE id = ?", (rel_id,))
            return cur.rowcount
