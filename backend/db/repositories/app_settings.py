"""Global app settings repository."""
from __future__ import annotations

import json
import time

from db.connection import get_db


class AppSettingsRepository:
    @staticmethod
    def get_json(key: str, default: dict) -> dict:
        with get_db() as conn:
            row = conn.execute(
                "SELECT value FROM app_settings WHERE key = ?",
                (key,),
            ).fetchone()
        if not row:
            return dict(default)
        try:
            parsed = json.loads(row["value"])
            return parsed if isinstance(parsed, dict) else dict(default)
        except Exception:
            return dict(default)

    @staticmethod
    def set_json(key: str, value: dict) -> None:
        now = time.time()
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at
                """,
                (key, json.dumps(value), now),
            )
