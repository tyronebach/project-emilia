"""Emotional engine debug endpoints"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from dependencies import verify_token
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

    state = EmotionalState(
        valence=state_row.get('valence') or 0.0,
        arousal=state_row.get('arousal') or 0.0,
        dominance=state_row.get('dominance') or 0.0,
        trust=state_row.get('trust') or 0.5,
        attachment=state_row.get('attachment') or 0.3,
        familiarity=state_row.get('familiarity') or 0.0,
        intimacy=state_row.get('intimacy') or 0.2,
        playfulness_safety=state_row.get('playfulness_safety') or 0.5,
        conflict_tolerance=state_row.get('conflict_tolerance') or 0.7,
    )

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


@router.get("/emotional-events/{user_id}/{agent_id}")
async def get_emotional_events(
    user_id: str,
    agent_id: str,
    limit: int = Query(50, le=200),
    token: str = Depends(verify_token)
):
    """Get recent emotional events for debugging."""
    events = EmotionalStateRepository.get_recent_events(user_id, agent_id, limit)
    return {
        "count": len(events),
        "events": events,
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
        raise HTTPException(status_code=404, detail="Agent not found")
    
    profile = AgentProfile(
        baseline_valence=agent.get('baseline_valence') or 0.2,
        baseline_arousal=agent.get('baseline_arousal') or 0.0,
        baseline_dominance=agent.get('baseline_dominance') or 0.0,
        emotional_volatility=agent.get('emotional_volatility') or 0.5,
        emotional_recovery=agent.get('emotional_recovery') or 0.1,
        trust_gain_multiplier=profile_data.get('trust_gain_multiplier', 1.0),
        trust_loss_multiplier=profile_data.get('trust_loss_multiplier', 1.0),
        trigger_multipliers=profile_data.get('trigger_multipliers', {}),
    )
    
    engine = EmotionEngine(profile)
    state = EmotionalState(
        valence=state_row.get('valence') or 0.0,
        arousal=state_row.get('arousal') or 0.0,
        dominance=state_row.get('dominance') or 0.0,
        trust=state_row.get('trust') or 0.5,
        attachment=state_row.get('attachment') or 0.3,
        familiarity=state_row.get('familiarity') or 0.0,
        intimacy=state_row.get('intimacy') or 0.2,
        playfulness_safety=state_row.get('playfulness_safety') or 0.5,
        conflict_tolerance=state_row.get('conflict_tolerance') or 0.7,
    )

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
    
    # Log the event
    EmotionalStateRepository.log_event(
        user_id=user_id,
        agent_id=agent_id,
        trigger_type='debug_trigger',
        trigger_value=trigger,
        delta_valence=deltas.get('valence') if deltas else None,
        delta_arousal=deltas.get('arousal') if deltas else None,
        delta_dominance=deltas.get('dominance') if deltas else None,
        delta_trust=deltas.get('trust') if deltas else None,
        delta_attachment=deltas.get('attachment') if deltas else None,
        state_after=state.to_dict(),
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
        raise HTTPException(status_code=404, detail="Agent not found")
    
    baseline_valence = agent.get('baseline_valence') or 0.2
    baseline_arousal = agent.get('baseline_arousal') or 0.0
    baseline_dominance = agent.get('baseline_dominance') or 0.0
    
    EmotionalStateRepository.update(
        user_id, agent_id,
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
        raise HTTPException(status_code=404, detail="Agent not found")
    
    profile = AgentProfile(
        baseline_valence=agent.get('baseline_valence') or 0.2,
        baseline_arousal=agent.get('baseline_arousal') or 0.0,
        baseline_dominance=agent.get('baseline_dominance') or 0.0,
        emotional_volatility=agent.get('emotional_volatility') or 0.5,
        emotional_recovery=agent.get('emotional_recovery') or 0.1,
        decay_rates=profile_data.get('decay_rates', {}),
    )
    
    engine = EmotionEngine(profile)
    state = EmotionalState(
        valence=state_row.get('valence') or 0.0,
        arousal=state_row.get('arousal') or 0.0,
        dominance=state_row.get('dominance') or 0.0,
        trust=state_row.get('trust') or 0.5,
        attachment=state_row.get('attachment') or 0.3,
        familiarity=state_row.get('familiarity') or 0.0,
        intimacy=state_row.get('intimacy') or 0.2,
        playfulness_safety=state_row.get('playfulness_safety') or 0.5,
        conflict_tolerance=state_row.get('conflict_tolerance') or 0.7,
    )

    state_before = state.to_dict()
    state = engine.apply_decay(state, seconds)

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
