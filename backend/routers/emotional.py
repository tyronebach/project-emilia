"""Emotional engine debug endpoints"""
import json
from fastapi import APIRouter, Depends, Query
from dependencies import verify_token
from core.exceptions import not_found
from db.repositories import EmotionalStateRepository, AgentRepository
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/emotional-state/{user_id}/{agent_id}")
async def get_emotional_state(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """
    Get current emotional state for a user-agent pair.

    Returns clean state values, behavior levers, and relationship dimensions.
    """
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
    agent = AgentRepository.get_by_id(agent_id)

    state = EmotionalState.from_db_row(state_row)

    levers = None
    if agent:
        profile = AgentProfile.from_db(agent, profile_data)
        engine = EmotionEngine(profile)
        levers = engine.get_behavior_levers(state)

    return {
        "state": state.to_dict(),
        "behavior_levers": levers,
        "profile": profile_data,
        "interaction_count": state_row.get("interaction_count", 0),
    }


@router.post("/emotional-trigger")
async def apply_trigger(
    user_id: str,
    agent_id: str,
    trigger: str,
    intensity: float = Query(0.7, ge=0.0, le=1.0),
    token: str = Depends(verify_token)
):
    """
    Manually apply a trigger for testing.
    
    This directly modifies the emotional state without going through chat.
    Useful for testing specific scenarios.
    """
    # Load state and profile
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
    
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    
    profile = AgentProfile.from_db(agent, profile_data)

    engine = EmotionEngine(profile)
    state = EmotionalState.from_db_row(state_row)

    state_before = state.to_dict()
    deltas = engine.apply_trigger(state, trigger, intensity)

    # Save updated state
    EmotionalStateRepository.update(
        user_id, agent_id,
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
    
    # Log V2 event
    EmotionalStateRepository.log_event_v2(
        user_id=user_id,
        agent_id=agent_id,
        session_id=None,
        message_snippet=f"[debug] {trigger}",
        triggers=[(trigger, intensity)],
        state_before=state_before,
        state_after=state.to_dict(),
        agent_behavior={},
        outcome="neutral",
    )
    
    return {
        "trigger": trigger,
        "intensity": intensity,
        "deltas": deltas,
        "state_before": state_before,
        "state_after": state.to_dict(),
        "behavior_levers": engine.get_behavior_levers(state),
    }


@router.post("/emotional-reset/{user_id}/{agent_id}")
async def reset_emotional_state(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Reset emotional state to baseline for testing."""
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    
    baseline_valence = agent.get('baseline_valence') if agent.get('baseline_valence') is not None else 0.2
    baseline_arousal = agent.get('baseline_arousal') if agent.get('baseline_arousal') is not None else 0.0
    baseline_dominance = agent.get('baseline_dominance') if agent.get('baseline_dominance') is not None else 0.0
    
    EmotionalStateRepository.update(
        user_id, agent_id,
        increment_interaction=False,
        valence=baseline_valence,
        arousal=baseline_arousal,
        dominance=baseline_dominance,
        trust=0.5,
        attachment=0.3,
        familiarity=0.0,
        intimacy=0.2,
        playfulness_safety=0.5,
        conflict_tolerance=0.7,
    )

    # Clear trigger calibrations on reset
    EmotionalStateRepository.update_calibration_json(user_id, agent_id, {})

    return {
        "reset": True,
        "state": {
            "valence": baseline_valence,
            "arousal": baseline_arousal,
            "dominance": baseline_dominance,
            "trust": 0.5,
            "attachment": 0.3,
            "familiarity": 0.0,
            "intimacy": 0.2,
            "playfulness_safety": 0.5,
            "conflict_tolerance": 0.7,
        }
    }


@router.get("/emotional-timeline/{user_id}/{agent_id}")
async def get_emotional_timeline(
    user_id: str,
    agent_id: str,
    limit: int = Query(30, ge=1, le=100),
    token: str = Depends(verify_token)
):
    """Get recent V2 emotional events for timeline/sparkline visualization."""
    events = EmotionalStateRepository.get_recent_events_v2(user_id, agent_id, limit)
    return {
        "count": len(events),
        "events": events,
    }


@router.post("/emotional-decay/{user_id}/{agent_id}")
async def apply_decay(
    user_id: str,
    agent_id: str,
    seconds: int = Query(3600, ge=0, le=86400),
    token: str = Depends(verify_token)
):
    """
    Manually apply time decay for testing.
    
    Simulates the passage of time without any triggers.
    """
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
    
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    
    profile = AgentProfile.from_db(agent, profile_data)

    engine = EmotionEngine(profile)
    state = EmotionalState.from_db_row(state_row)

    state_before = state.to_dict()
    state = engine.apply_decay(state, seconds)

    EmotionalStateRepository.update(
        user_id, agent_id,
        increment_interaction=False,
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
    
    return {
        "seconds_elapsed": seconds,
        "state_before": state_before,
        "state_after": state.to_dict(),
    }


@router.get("/calibration/{user_id}/{agent_id}")
async def get_calibration(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Get user's trigger calibration profile for debugging."""
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    raw_cal = state_row.get('trigger_calibration_json')
    calibration = {}
    if raw_cal:
        try:
            calibration = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
        except (json.JSONDecodeError, TypeError):
            calibration = {}

    return {
        "user_id": user_id,
        "agent_id": agent_id,
        "relationship_dimensions": {
            "trust": state_row.get("trust"),
            "intimacy": state_row.get("intimacy"),
            "playfulness_safety": state_row.get("playfulness_safety"),
            "conflict_tolerance": state_row.get("conflict_tolerance"),
        },
        "trigger_calibration": calibration,
        "interaction_count": state_row.get("interaction_count"),
    }
