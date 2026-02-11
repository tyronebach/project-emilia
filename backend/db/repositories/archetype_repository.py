"""Global drift archetype repository."""
from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from db.connection import get_db
from services.emotion_engine import EmotionEngine, normalize_trigger
from services.trigger_classifier import get_trigger_classifier


class ArchetypeRepository:
    DEFAULT_OUTCOMES = {
        "positive": 0.33,
        "neutral": 0.34,
        "negative": 0.33,
    }
    OUTCOME_KEYS = ("positive", "neutral", "negative")

    @staticmethod
    def normalize_outcome_weights(raw: dict | None) -> dict[str, float]:
        if not isinstance(raw, dict):
            return dict(ArchetypeRepository.DEFAULT_OUTCOMES)

        weights: dict[str, float] = {}
        for key in ArchetypeRepository.OUTCOME_KEYS:
            value = raw.get(key, 0.0)
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                numeric = 0.0
            weights[key] = max(0.0, numeric)

        total = sum(weights.values())
        if total <= 0:
            return dict(ArchetypeRepository.DEFAULT_OUTCOMES)
        return {key: round(weights[key] / total, 4) for key in ArchetypeRepository.OUTCOME_KEYS}

    @staticmethod
    def list_all() -> list[dict]:
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT id, name, description, sample_count, source_filename, created_at, updated_at
                FROM drift_archetypes
                ORDER BY updated_at DESC, name ASC
                """
            ).fetchall()
        return rows

    @staticmethod
    def get(archetype_id: str) -> dict | None:
        with get_db() as conn:
            row = conn.execute(
                """
                SELECT id, name, description, message_triggers, outcome_weights,
                       sample_count, source_filename, created_at, updated_at
                FROM drift_archetypes
                WHERE id = ?
                """,
                (archetype_id,),
            ).fetchone()
        if not row:
            return None
        return ArchetypeRepository._deserialize(dict(row))

    @staticmethod
    def create(payload: dict[str, Any]) -> dict:
        now = int(time.time())
        message_triggers = json.dumps(payload["message_triggers"])
        outcome_weights = json.dumps(
            ArchetypeRepository.normalize_outcome_weights(payload.get("outcome_weights"))
        )
        sample_count = int(payload.get("sample_count") or len(payload["message_triggers"]))
        source_filename = payload.get("source_filename")

        with get_db() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO drift_archetypes (
                        id, name, description, message_triggers, outcome_weights,
                        sample_count, source_filename, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["id"],
                        payload["name"],
                        payload.get("description") or "",
                        message_triggers,
                        outcome_weights,
                        sample_count,
                        source_filename,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError(f"Archetype id already exists: {payload['id']}") from exc
        created = ArchetypeRepository.get(payload["id"])
        if not created:
            raise ValueError(f"Failed to create archetype: {payload['id']}")
        return created

    @staticmethod
    def update(archetype_id: str, payload: dict[str, Any]) -> dict | None:
        updates: list[str] = []
        params: list[Any] = []

        if "name" in payload:
            updates.append("name = ?")
            params.append(payload["name"])

        if "description" in payload:
            updates.append("description = ?")
            params.append(payload.get("description") or "")

        if "message_triggers" in payload:
            updates.append("message_triggers = ?")
            params.append(json.dumps(payload["message_triggers"]))
            updates.append("sample_count = ?")
            params.append(int(payload.get("sample_count") or len(payload["message_triggers"])))

        if "outcome_weights" in payload:
            updates.append("outcome_weights = ?")
            params.append(json.dumps(ArchetypeRepository.normalize_outcome_weights(payload["outcome_weights"])))

        if "source_filename" in payload:
            updates.append("source_filename = ?")
            params.append(payload.get("source_filename"))

        if not updates:
            return ArchetypeRepository.get(archetype_id)

        updates.append("updated_at = ?")
        params.append(int(time.time()))
        params.append(archetype_id)

        with get_db() as conn:
            result = conn.execute(
                f"UPDATE drift_archetypes SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            if result.rowcount <= 0:
                return None
        return ArchetypeRepository.get(archetype_id)

    @staticmethod
    def delete(archetype_id: str) -> bool:
        with get_db() as conn:
            result = conn.execute(
                "DELETE FROM drift_archetypes WHERE id = ?",
                (archetype_id,),
            )
            return result.rowcount > 0

    @staticmethod
    def generate_from_messages(
        *,
        archetype_id: str,
        name: str,
        description: str,
        messages: list[str],
        source_filename: str | None = None,
        outcome_weights: dict | None = None,
    ) -> dict:
        classifier = get_trigger_classifier()

        message_triggers: list[list[list[str | float]]] = []
        trigger_counts: dict[str, int] = {}

        for message in messages:
            trigger_map: dict[str, float] = {}
            for trigger, confidence in classifier.classify(message):
                canonical = normalize_trigger(trigger) or str(trigger).strip().lower()
                if canonical == "neutral":
                    continue
                if canonical not in EmotionEngine.DEFAULT_TRIGGER_DELTAS:
                    continue
                if canonical not in trigger_map or confidence > trigger_map[canonical]:
                    trigger_map[canonical] = float(confidence)

            ordered = sorted(trigger_map.items(), key=lambda item: item[1], reverse=True)
            trigger_set = [[trigger, float(f"{confidence:.4f}")] for trigger, confidence in ordered]
            message_triggers.append(trigger_set)
            for trigger, _confidence in ordered:
                trigger_counts[trigger] = trigger_counts.get(trigger, 0) + 1

        created = ArchetypeRepository.create(
            {
                "id": archetype_id,
                "name": name,
                "description": description,
                "message_triggers": message_triggers,
                "outcome_weights": outcome_weights,
                "sample_count": len(messages),
                "source_filename": source_filename,
            }
        )

        total_hits = sum(trigger_counts.values()) or 1
        distribution = {
            trigger: round(count / total_hits, 4)
            for trigger, count in sorted(trigger_counts.items(), key=lambda item: item[1], reverse=True)
        }
        created["trigger_distribution"] = distribution
        return created

    @staticmethod
    def _deserialize(row: dict[str, Any]) -> dict[str, Any]:
        result = dict(row)
        for key, fallback in (("message_triggers", []), ("outcome_weights", {})):
            raw = result.get(key)
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = fallback
                result[key] = parsed
            elif raw is None:
                result[key] = fallback
        result["outcome_weights"] = ArchetypeRepository.normalize_outcome_weights(result.get("outcome_weights"))
        return result
