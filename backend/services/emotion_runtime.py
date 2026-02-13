"""Shared emotion runtime hooks used by chat and room routers."""

from __future__ import annotations

import json
import logging
import threading

from db.repositories import AgentRepository, EmotionalStateRepository
from services.emotion_engine import (
    AgentProfile,
    ContextualTriggerCalibration,
    EmotionEngine,
    EmotionalState,
    infer_outcome_multisignal,
    normalize_trigger,
)

logger = logging.getLogger(__name__)

# Per-user-agent lock to serialize emotional state read-modify-write.
_emotion_locks: dict[tuple[str, str], threading.Lock] = {}
_emotion_locks_guard = threading.Lock()


def get_emotion_lock(user_id: str, agent_id: str) -> threading.Lock:
    """Get or create a per-user-agent lock for emotional state serialization."""
    key = (user_id, agent_id)
    if key not in _emotion_locks:
        with _emotion_locks_guard:
            if key not in _emotion_locks:
                _emotion_locks[key] = threading.Lock()
    return _emotion_locks[key]


async def process_emotion_pre_llm(
    user_id: str,
    agent_id: str,
    user_message: str,
    session_id: str | None = None,
) -> tuple[str | None, list[tuple[str, float]]]:
    """
    Process emotional state BEFORE LLM call.

    1. Load/create emotional state
    2. Apply time-based decay
    3. Detect triggers from user message (LLM or regex)
    4. Apply trigger deltas
    5. Return emotional context block for prompt injection

    Returns (context_block, detected_triggers).
    """
    del session_id  # Reserved for compatibility/signature parity.

    try:
        lock = get_emotion_lock(user_id, agent_id)
        if not lock.acquire(timeout=5.0):
            logger.warning("Emotion lock timeout for %s", (user_id, agent_id))
            return None, []
        try:
            # Load state and profile
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            profile_data = EmotionalStateRepository.get_agent_profile(agent_id)

            # Get agent baseline from DB
            agent = AgentRepository.get_by_id(agent_id)
            if not agent:
                return None, []

            # Build profile from DB (emotional_profile column has all settings)
            profile = AgentProfile.from_db(agent, profile_data)

            engine = EmotionEngine(profile)

            # Convert DB row to EmotionalState
            # Load persisted mood_weights from DB, or initialize from agent's mood_baseline
            mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)

            # FIX: Initialize mood_weights from mood_baseline if empty (Bug #1)
            if not mood_weights:
                from services.emotion_engine import get_mood_list

                mood_weights = {mood: profile.mood_baseline.get(mood, 0) for mood in get_mood_list()}
                logger.info(
                    "[Emotion] Initialized mood_weights from mood_baseline for %s/%s",
                    user_id,
                    agent_id,
                )

            # Load V2 trigger calibration
            cal_json = {}
            raw_cal = state_row.get("trigger_calibration_json")
            if raw_cal:
                try:
                    cal_json = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
                except (json.JSONDecodeError, TypeError):
                    cal_json = {}
            calibrations: dict[str, ContextualTriggerCalibration] = {}
            for k, v in cal_json.items():
                if isinstance(v, dict):
                    calibrations[k] = ContextualTriggerCalibration.from_dict(v)

            state = EmotionalState.from_db_row(
                state_row,
                calibrations=calibrations,
                mood_weights=mood_weights,
            )

            # Apply decay since last interaction
            last_updated = state_row.get("last_updated") or 0
            if last_updated:
                import time as time_module

                elapsed = time_module.time() - last_updated
                state = engine.apply_decay(state, elapsed)
                engine.apply_mood_decay(state, elapsed)

            # Classifier-based trigger detection
            normalized_user_message = (user_message or "").strip()
            recent_context_triggers = (
                EmotionalStateRepository.get_recent_trigger_labels(user_id, agent_id, limit_events=5)
                if normalized_user_message
                else []
            )
            classifier_triggers = (
                engine.detect_triggers(
                    normalized_user_message,
                    recent_context_triggers=recent_context_triggers,
                )
                if normalized_user_message
                else []
            )

            # Normalize to canonical trigger keys so designer presets always apply.
            trigger_map = {}
            for trigger, intensity in classifier_triggers:
                canonical = normalize_trigger(trigger) or trigger
                if canonical not in trigger_map or intensity > trigger_map[canonical]:
                    trigger_map[canonical] = intensity
            triggers = list(trigger_map.items())

            # Accumulate V/A deltas during trigger loop, then project onto moods
            total_va_delta = {"valence": 0.0, "arousal": 0.0}
            for trigger, intensity in triggers:
                cal = state.trigger_calibration.get(trigger)
                deltas = engine.apply_trigger_calibrated(state, trigger, intensity, cal)
                for axis in ("valence", "arousal"):
                    total_va_delta[axis] += deltas.get(axis, 0.0)

            if triggers:
                mood_deltas = engine.calculate_mood_deltas_from_va(total_va_delta)
                if mood_deltas:
                    engine.apply_mood_deltas(state, mood_deltas)
                    logger.debug(
                        "[Emotion] Mood deltas (V/A projected): %s",
                        {k: round(v, 3) for k, v in mood_deltas.items() if abs(v) > 0.001},
                    )

            # Save updated state (including mood_weights + V2 dimensions)
            EmotionalStateRepository.update(
                user_id,
                agent_id,
                mood_weights=state.mood_weights,
                valence=state.valence,
                arousal=state.arousal,
                dominance=state.dominance,
                trust=state.trust,
                attachment=state.attachment,
                familiarity=state.familiarity,
                intimacy=state.intimacy,
                playfulness_safety=state.playfulness_safety,
                conflict_tolerance=state.conflict_tolerance,
            )

            # Generate context block for prompt
            context = engine.generate_context_block(state)
            logger.info("[Emotion] Pre-LLM context for %s/%s:\n%s", user_id, agent_id, context)
            return context, triggers
        finally:
            lock.release()

    except Exception:
        logger.exception("Emotion engine error (pre-LLM), continuing without emotional context")
        return None, []


def process_emotion_post_llm(
    user_id: str,
    agent_id: str,
    behavior: dict,
    session_id: str | None = None,
    pre_llm_triggers: list[tuple[str, float]] | None = None,
    user_message: str | None = None,
) -> None:
    """
    Process emotional state AFTER LLM response.

    1. Apply mood shifts from agent's behavior tags.
    2. V2: Infer outcome from multiple signals.
    3. V2: Learn from outcome (update trigger calibrations).
    4. V2: Update relationship dimensions.
    """
    try:
        if not behavior:
            return

        lock = get_emotion_lock(user_id, agent_id)
        if not lock.acquire(timeout=5.0):
            logger.warning("Emotion lock timeout for %s", (user_id, agent_id))
            return
        try:
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
            agent = AgentRepository.get_by_id(agent_id)

            if not agent:
                return

            profile = AgentProfile.from_db(agent, profile_data)
            engine = EmotionEngine(profile)

            # Load state with V2 fields
            cal_json = {}
            raw_cal = state_row.get("trigger_calibration_json")
            if raw_cal:
                try:
                    cal_json = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
                except (json.JSONDecodeError, TypeError):
                    cal_json = {}
            calibrations: dict[str, ContextualTriggerCalibration] = {}
            for k, v in cal_json.items():
                if isinstance(v, dict):
                    calibrations[k] = ContextualTriggerCalibration.from_dict(v)

            state = EmotionalState.from_db_row(state_row, calibrations=calibrations)

            state_before_dict = state.to_dict()

            # 1. Apply mood self-report trigger (existing behavior)
            mood = behavior.get("mood")
            mood_to_trigger = {
                "happy": ("joy", 0.3),
                "sad": ("sadness", 0.3),
                "angry": ("anger", 0.2),
                "embarrassed": ("embarrassment", 0.2),
                "excited": ("excitement", 0.4),
            }

            if mood and mood in mood_to_trigger:
                trigger, intensity = mood_to_trigger[mood]
                intensity *= behavior.get("mood_intensity", 1.0)
                engine.apply_trigger(state, trigger, intensity)

            # 2. V2: Infer outcome from multiple signals
            outcome, confidence = infer_outcome_multisignal(
                next_user_message=user_message,
                agent_behavior=behavior,
            )

            # 3. V2: Learn from outcome (update trigger calibrations)
            calibration_updates: dict[str, dict] = {}
            if pre_llm_triggers and outcome != "neutral":
                updated = engine.learn_from_outcome(state, pre_llm_triggers, outcome, confidence)
                calibration_updates = {k: v.to_dict() for k, v in updated.items()}

                if calibration_updates:
                    all_cals = {
                        k: (v.to_dict() if hasattr(v, "to_dict") else v)
                        for k, v in state.trigger_calibration.items()
                    }
                    EmotionalStateRepository.update_calibration_json(user_id, agent_id, all_cals)
                    logger.info(
                        "[Emotion] Learned from %s outcome (conf=%.2f): %s",
                        outcome,
                        confidence,
                        list(calibration_updates.keys()),
                    )

            # 4. V2: Update relationship dimensions
            dimension_deltas: dict[str, float] = {}
            if pre_llm_triggers:
                dimension_deltas = engine.update_relationship_dimensions(state, pre_llm_triggers, outcome)
                if dimension_deltas:
                    logger.info("[Emotion] Dimension updates: %s", dimension_deltas)

            # Save all updated state (no interaction increment — pre_llm already counted it)
            EmotionalStateRepository.update(
                user_id,
                agent_id,
                increment_interaction=False,
                valence=state.valence,
                arousal=state.arousal,
                intimacy=state.intimacy,
                playfulness_safety=state.playfulness_safety,
                conflict_tolerance=state.conflict_tolerance,
                trust=state.trust,
            )

            # 5. V2: Log event (always, even without triggers)
            EmotionalStateRepository.log_event_v2(
                user_id=user_id,
                agent_id=agent_id,
                session_id=session_id,
                message_snippet=user_message,
                triggers=pre_llm_triggers or [],
                state_before=state_before_dict,
                state_after=state.to_dict(),
                agent_behavior=behavior,
                outcome=outcome,
                calibration_updates=calibration_updates or None,
            )
        finally:
            lock.release()

    except Exception:
        logger.exception("Emotion engine error (post-LLM), ignoring")
