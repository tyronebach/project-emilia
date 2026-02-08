"""Emotional state repository — foundation layer for the emotion engine."""
import uuid
import json
import time
from db.connection import get_db


DEFAULT_EMOTIONAL_PROFILE = {
    "decay_rates": {"valence": 0.1, "arousal": 0.12, "trust": 0.02, "attachment": 0.01},
    "trust_gain_multiplier": 1.0,
    "trust_loss_multiplier": 1.0,
    "attachment_ceiling": 1.0,
    "trigger_multipliers": {},
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
        for key in ("decay_rates", "trigger_multipliers"):
            profile[key] = {**DEFAULT_EMOTIONAL_PROFILE.get(key, {}), **stored.get(key, {})}

        return profile

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
    def update(user_id: str, agent_id: str, mood_weights: dict | None = None, **changes) -> dict:
        """Update emotional state axes. Clamps values to valid ranges."""
        allowed = {
            "valence", "arousal", "dominance",
            "trust", "attachment", "familiarity",
        }

        set_clauses = ["last_updated = ?", "interaction_count = interaction_count + 1",
                       "last_interaction = ?"]
        now = time.time()
        params: list = [now, now]

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

    @staticmethod
    def log_event(
        user_id: str,
        agent_id: str,
        trigger_type: str,
        trigger_value: str | None = None,
        session_id: str | None = None,
        delta_valence: float | None = None,
        delta_arousal: float | None = None,
        delta_dominance: float | None = None,
        delta_trust: float | None = None,
        delta_attachment: float | None = None,
        state_after: dict | None = None,
    ) -> dict:
        """Log an emotional event for debugging/tuning."""
        event_id = str(uuid.uuid4())
        now = time.time()

        state_json = json.dumps(state_after) if state_after else None

        with get_db() as conn:
            conn.execute(
                """INSERT INTO emotional_events
                   (id, user_id, agent_id, session_id, timestamp,
                    trigger_type, trigger_value,
                    delta_valence, delta_arousal, delta_dominance,
                    delta_trust, delta_attachment, state_after_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event_id, user_id, agent_id, session_id, now,
                 trigger_type, trigger_value,
                 delta_valence, delta_arousal, delta_dominance,
                 delta_trust, delta_attachment, state_json)
            )
            return {
                "id": event_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "session_id": session_id,
                "timestamp": now,
                "trigger_type": trigger_type,
                "trigger_value": trigger_value,
            }

    @staticmethod
    def get_recent_events(
        user_id: str,
        agent_id: str,
        limit: int = 50
    ) -> list[dict]:
        """Get recent emotional events for debugging."""
        with get_db() as conn:
            rows = conn.execute(
                """SELECT id, user_id, agent_id, session_id, timestamp,
                          trigger_type, trigger_value,
                          delta_valence, delta_arousal, delta_dominance,
                          delta_trust, delta_attachment, state_after_json
                   FROM emotional_events
                   WHERE user_id = ? AND agent_id = ?
                   ORDER BY timestamp DESC
                   LIMIT ?""",
                (user_id, agent_id, limit)
            ).fetchall()
            
            events = []
            for row in rows:
                event = dict(row)
                # Parse the state_after_json back to dict
                if event.get('state_after_json'):
                    event['state_after'] = json.loads(event['state_after_json'])
                    del event['state_after_json']
                events.append(event)
            
            return events
