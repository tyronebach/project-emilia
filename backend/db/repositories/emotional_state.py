"""Emotional state repository — foundation layer for the emotion engine."""
import uuid
import json
import time
from db.connection import get_db


DEFAULT_EMOTIONAL_PROFILE = {
    "decay_rates": {"valence": 0.1, "arousal": 0.12, "trust": 0.02, "attachment": 0.01},
    "trust_gain_multiplier": 1.0,
    "trust_loss_multiplier": 1.0,
    "valence_gain_multiplier": 0.95,
    "valence_loss_multiplier": 1.1,
    "bond_gain_multiplier": 0.95,
    "bond_loss_multiplier": 1.1,
    "mood_gain_multiplier": 0.9,
    "mood_loss_multiplier": 1.1,
    "attachment_ceiling": 1.0,
    "trigger_multipliers": {},
    "trigger_responses": {},
}


class EmotionalStateRepository:

    @staticmethod
    def get_agent_profile(agent_id: str) -> dict:
        """Load agent's emotional_profile JSON, with defaults for missing keys."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT emotional_profile FROM agents WHERE id = ?", (agent_id,)
            ).fetchone()

        stored = {}
        if row and row["emotional_profile"]:
            stored = json.loads(row["emotional_profile"])

        # Merge: stored values override defaults
        profile = {**DEFAULT_EMOTIONAL_PROFILE, **stored}
        # Deep-merge nested dicts
        for key in ("decay_rates", "trigger_multipliers", "trigger_responses"):
            profile[key] = {**DEFAULT_EMOTIONAL_PROFILE.get(key, {}), **stored.get(key, {})}

        return profile

    @staticmethod
    def get(user_id: str, agent_id: str) -> dict | None:
        """Get emotional state for a user-agent pair, or None if it doesn't exist."""
        with get_db() as conn:
            return conn.execute(
                "SELECT * FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

    @staticmethod
    def get_or_create(user_id: str, agent_id: str) -> dict:
        """Get emotional state for a user-agent pair, creating default if needed."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

            if row:
                return row

            now = time.time()
            row_id = str(uuid.uuid4())

            # Pull agent baselines if available
            agent = conn.execute(
                "SELECT baseline_valence, baseline_arousal, baseline_dominance FROM agents WHERE id = ?",
                (agent_id,)
            ).fetchone()

            valence = agent["baseline_valence"] if agent and agent["baseline_valence"] is not None else 0.0
            arousal = agent["baseline_arousal"] if agent and agent["baseline_arousal"] is not None else 0.0
            dominance = agent["baseline_dominance"] if agent and agent["baseline_dominance"] is not None else 0.0

            conn.execute(
                """INSERT INTO emotional_state
                   (id, user_id, agent_id, valence, arousal, dominance,
                    trust, attachment, familiarity,
                    last_updated, last_interaction, interaction_count)
                   VALUES (?, ?, ?, ?, ?, ?, 0.5, 0.3, 0.0, ?, NULL, 0)""",
                (row_id, user_id, agent_id, valence, arousal, dominance, now)
            )

            return conn.execute(
                "SELECT * FROM emotional_state WHERE id = ?", (row_id,)
            ).fetchone()

    @staticmethod
    def parse_mood_weights(state_row: dict | None) -> dict:
        """Parse mood_weights_json from an emotional_state row safely."""
        if not state_row:
            return {}
        raw_mw = state_row.get("mood_weights_json")
        if not raw_mw:
            return {}
        try:
            parsed = json.loads(raw_mw) if isinstance(raw_mw, str) else raw_mw
        except (json.JSONDecodeError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def update(user_id: str, agent_id: str, mood_weights: dict | None = None,
               increment_interaction: bool = True, **changes) -> dict:
        """Update emotional state axes. Clamps values to valid ranges."""
        allowed = {
            "valence", "arousal", "dominance",
            "trust", "attachment", "familiarity",
            "intimacy", "playfulness_safety", "conflict_tolerance",
        }

        set_clauses = ["last_updated = ?"]
        now = time.time()
        params: list = [now]

        if increment_interaction:
            set_clauses.append("interaction_count = interaction_count + 1")
            set_clauses.append("last_interaction = ?")
            params.append(now)

        for key, value in changes.items():
            if key not in allowed:
                continue
            # Clamp: valence/arousal/dominance to [-1,1], others to [0,1]
            if key in ("valence", "arousal", "dominance"):
                value = max(-1.0, min(1.0, float(value)))
            else:
                value = max(0.0, min(1.0, float(value)))
            set_clauses.append(f"{key} = ?")
            params.append(value)

        # Handle trigger_calibration_json separately (not clamped)
        if "trigger_calibration_json" in changes:
            cal_json = changes["trigger_calibration_json"]
            if isinstance(cal_json, dict):
                cal_json = json.dumps(cal_json)
            set_clauses.append("trigger_calibration_json = ?")
            params.append(cal_json)

        if mood_weights is not None:
            set_clauses.append("mood_weights_json = ?")
            params.append(json.dumps(mood_weights))

        params.extend([user_id, agent_id])
        sql = f"UPDATE emotional_state SET {', '.join(set_clauses)} WHERE user_id = ? AND agent_id = ?"

        with get_db() as conn:
            conn.execute(sql, params)
            return conn.execute(
                "SELECT * FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

    @staticmethod
    def apply_decay(user_id: str, agent_id: str, recovery_rate: float = 0.1) -> dict | None:
        """Decay emotional state toward agent baseline. Returns updated state or None if no state exists.

        The actual decay formula will be implemented by the emotion engine.
        This method provides the DB plumbing: read current -> compute decay -> write back.
        """
        with get_db() as conn:
            state = conn.execute(
                "SELECT * FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

            if not state:
                return None

            agent = conn.execute(
                """SELECT baseline_valence, baseline_arousal, baseline_dominance,
                          emotional_recovery
                   FROM agents WHERE id = ?""",
                (agent_id,)
            ).fetchone()

            baseline_v = (agent["baseline_valence"] if agent and agent["baseline_valence"] is not None else 0.0)
            baseline_a = (agent["baseline_arousal"] if agent and agent["baseline_arousal"] is not None else 0.0)
            baseline_d = (agent["baseline_dominance"] if agent and agent["baseline_dominance"] is not None else 0.0)
            rate = (agent["emotional_recovery"] if agent and agent["emotional_recovery"] is not None else recovery_rate)

            # Linear interpolation toward baseline
            new_v = state["valence"] + rate * (baseline_v - state["valence"])
            new_a = state["arousal"] + rate * (baseline_a - state["arousal"])
            new_d = state["dominance"] + rate * (baseline_d - state["dominance"])

            now = time.time()
            conn.execute(
                """UPDATE emotional_state
                   SET valence = ?, arousal = ?, dominance = ?, last_updated = ?
                   WHERE user_id = ? AND agent_id = ?""",
                (new_v, new_a, new_d, now, user_id, agent_id)
            )

            return conn.execute(
                "SELECT * FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

    # ========== V2: Calibration & Event Logging ==========

    @staticmethod
    def get_calibration_json(user_id: str, agent_id: str) -> dict:
        """Load trigger calibration JSON for a user-agent pair."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT trigger_calibration_json FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()
        if row and row.get("trigger_calibration_json"):
            return json.loads(row["trigger_calibration_json"])
        return {}

    @staticmethod
    def update_calibration_json(user_id: str, agent_id: str, calibration: dict) -> None:
        """Save trigger calibration JSON for a user-agent pair."""
        with get_db() as conn:
            conn.execute(
                "UPDATE emotional_state SET trigger_calibration_json = ? WHERE user_id = ? AND agent_id = ?",
                (json.dumps(calibration), user_id, agent_id)
            )

    @staticmethod
    def log_event_v2(
        user_id: str,
        agent_id: str,
        session_id: str | None,
        message_snippet: str | None,
        triggers: list[tuple[str, float]],
        state_before: dict,
        state_after: dict,
        agent_behavior: dict,
        outcome: str,
        calibration_updates: dict | None = None,
    ) -> str:
        """Log a complete emotional event for debugging and analysis."""
        event_id = str(uuid.uuid4())
        now = time.time()

        dominant_before = max(state_before.get("mood_weights", {}).items(), key=lambda x: x[1], default=("neutral", 0))[0] if state_before.get("mood_weights") else "neutral"
        dominant_after = max(state_after.get("mood_weights", {}).items(), key=lambda x: x[1], default=("neutral", 0))[0] if state_after.get("mood_weights") else "neutral"

        with get_db() as conn:
            conn.execute("""
                INSERT INTO emotional_events_v2 (
                    id, user_id, agent_id, session_id, timestamp,
                    message_snippet, triggers_json,
                    valence_before, valence_after,
                    arousal_before, arousal_after,
                    dominant_mood_before, dominant_mood_after,
                    agent_mood_tag, agent_intent_tag, inferred_outcome,
                    trust_delta, intimacy_delta, calibration_updates_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id, user_id, agent_id, session_id, now,
                message_snippet[:100] if message_snippet else None,
                json.dumps(triggers),
                state_before.get("valence", 0), state_after.get("valence", 0),
                state_before.get("arousal", 0), state_after.get("arousal", 0),
                dominant_before, dominant_after,
                agent_behavior.get("mood"), agent_behavior.get("intent"), outcome,
                state_after.get("trust", 0.5) - state_before.get("trust", 0.5),
                state_after.get("intimacy", 0.2) - state_before.get("intimacy", 0.2),
                json.dumps(calibration_updates) if calibration_updates else None,
            ))

        return event_id

    # ========== Async Trigger Batching ==========

    @staticmethod
    def get_trigger_buffer(user_id: str, agent_id: str) -> list[str]:
        """Get buffered messages waiting for LLM classification."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT trigger_buffer FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

        if row and row["trigger_buffer"]:
            return json.loads(row["trigger_buffer"])
        return []

    @staticmethod
    def append_to_buffer(user_id: str, agent_id: str, message: str, max_size: int = 4) -> list[str]:
        """Append message to buffer, return current buffer. Trims to max_size."""
        buffer = EmotionalStateRepository.get_trigger_buffer(user_id, agent_id)
        buffer.append(message)
        
        # Keep only last N messages
        if len(buffer) > max_size:
            buffer = buffer[-max_size:]

        with get_db() as conn:
            conn.execute(
                "UPDATE emotional_state SET trigger_buffer = ? WHERE user_id = ? AND agent_id = ?",
                (json.dumps(buffer), user_id, agent_id)
            )
        
        return buffer

    @staticmethod
    def clear_buffer(user_id: str, agent_id: str) -> None:
        """Clear the trigger buffer after LLM classification."""
        with get_db() as conn:
            conn.execute(
                "UPDATE emotional_state SET trigger_buffer = NULL WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            )

    @staticmethod
    def get_pending_triggers(user_id: str, agent_id: str) -> list[tuple[str, float]]:
        """Get pending LLM-detected triggers to apply."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT pending_triggers FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

        if row and row["pending_triggers"]:
            return [tuple(t) for t in json.loads(row["pending_triggers"])]
        return []

    @staticmethod
    def set_pending_triggers(user_id: str, agent_id: str, triggers: list[tuple[str, float]]) -> None:
        """Store LLM-detected triggers for next turn."""
        with get_db() as conn:
            conn.execute(
                "UPDATE emotional_state SET pending_triggers = ? WHERE user_id = ? AND agent_id = ?",
                (json.dumps(triggers), user_id, agent_id)
            )

    @staticmethod
    def pop_pending_triggers(user_id: str, agent_id: str) -> list[tuple[str, float]]:
        """Get and clear pending triggers atomically in a single connection."""
        with get_db() as conn:
            row = conn.execute(
                "SELECT pending_triggers FROM emotional_state WHERE user_id = ? AND agent_id = ?",
                (user_id, agent_id)
            ).fetchone()

            if row and row["pending_triggers"]:
                conn.execute(
                    "UPDATE emotional_state SET pending_triggers = NULL WHERE user_id = ? AND agent_id = ?",
                    (user_id, agent_id)
                )
                return [tuple(t) for t in json.loads(row["pending_triggers"])]
        return []

    @staticmethod
    def get_recent_events_v2(
        user_id: str,
        agent_id: str,
        limit: int = 30,
    ) -> list[dict]:
        """Get recent V2 emotional events for timeline visualization."""
        with get_db() as conn:
            rows = conn.execute(
                """SELECT timestamp, valence_before, valence_after,
                          arousal_before, arousal_after,
                          trust_delta, intimacy_delta,
                          dominant_mood_after, triggers_json, inferred_outcome
                   FROM emotional_events_v2
                   WHERE user_id = ? AND agent_id = ?
                   ORDER BY timestamp ASC
                   LIMIT ?""",
                (user_id, agent_id, limit)
            ).fetchall()

            events = []
            for row in rows:
                event = dict(row)
                if event.get("triggers_json"):
                    event["triggers"] = json.loads(event["triggers_json"])
                    del event["triggers_json"]
                else:
                    event["triggers"] = []
                    event.pop("triggers_json", None)
                events.append(event)

            return events

    @staticmethod
    def get_recent_trigger_labels(
        user_id: str,
        agent_id: str,
        limit_events: int = 5,
    ) -> list[str]:
        """Return flattened trigger labels from recent emotional events."""
        if limit_events <= 0:
            return []

        with get_db() as conn:
            rows = conn.execute(
                """SELECT triggers_json
                   FROM emotional_events_v2
                   WHERE user_id = ? AND agent_id = ?
                   ORDER BY timestamp DESC
                   LIMIT ?""",
                (user_id, agent_id, int(limit_events)),
            ).fetchall()

        labels: list[str] = []
        for row in rows:
            raw = row.get("triggers_json") if isinstance(row, dict) else None
            if not raw:
                continue
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
            except (json.JSONDecodeError, TypeError):
                continue

            if not isinstance(parsed, list):
                continue
            for entry in parsed:
                if not isinstance(entry, (list, tuple)) or not entry:
                    continue
                label = str(entry[0]).strip().lower()
                if label:
                    labels.append(label)

        return labels
