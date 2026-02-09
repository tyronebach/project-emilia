"""TTS cache repository for database operations."""
import time
from db.connection import get_db

# Prune every N puts to avoid checking count on every insert
_put_counter = 0
_PRUNE_INTERVAL = 10


class TTSCacheRepository:

    @staticmethod
    def get(key: str) -> dict | None:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM tts_cache WHERE key = ?",
                (key,)
            ).fetchone()
            if not row:
                return None

            now = int(time.time())
            hits = (row.get("hits") or 0) + 1
            conn.execute(
                "UPDATE tts_cache SET last_used = ?, hits = ? WHERE key = ?",
                (now, hits, key)
            )
            row["last_used"] = now
            row["hits"] = hits
            return row

    @staticmethod
    def put(
        key: str,
        voice_id: str,
        model_id: str,
        voice_settings: str,
        text: str,
        audio_base64: str,
        alignment_json: str | None,
        duration_estimate: float | None,
        audio_bytes: int | None,
    ) -> None:
        now = int(time.time())
        with get_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO tts_cache (
                    key,
                    voice_id,
                    model_id,
                    voice_settings,
                    text,
                    audio_base64,
                    alignment_json,
                    duration_estimate,
                    audio_bytes,
                    created_at,
                    last_used,
                    hits
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    voice_id,
                    model_id,
                    voice_settings,
                    text,
                    audio_base64,
                    alignment_json,
                    duration_estimate,
                    audio_bytes,
                    now,
                    now,
                    0,
                )
            )

        # Periodically prune to enforce max_entries limit
        global _put_counter
        _put_counter += 1
        if _put_counter >= _PRUNE_INTERVAL:
            _put_counter = 0
            from config import settings
            TTSCacheRepository.prune(settings.tts_cache_max_entries)

    @staticmethod
    def prune(max_entries: int) -> int:
        if max_entries <= 0:
            with get_db() as conn:
                result = conn.execute("DELETE FROM tts_cache")
                return result.rowcount

        with get_db() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM tts_cache").fetchone()
            count = row["count"] if row else 0
            if count <= max_entries:
                return 0

            to_delete = count - max_entries
            result = conn.execute(
                """
                DELETE FROM tts_cache
                WHERE key IN (
                    SELECT key FROM tts_cache
                    ORDER BY last_used ASC
                    LIMIT ?
                )
                """,
                (to_delete,)
            )
            return result.rowcount

    @staticmethod
    def expire(ttl_seconds: int) -> int:
        if ttl_seconds <= 0:
            with get_db() as conn:
                result = conn.execute("DELETE FROM tts_cache")
                return result.rowcount

        cutoff = int(time.time()) - ttl_seconds
        with get_db() as conn:
            result = conn.execute(
                "DELETE FROM tts_cache WHERE created_at < ?",
                (cutoff,)
            )
            return result.rowcount
