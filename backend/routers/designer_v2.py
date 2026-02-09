"""Designer V2 API — Personality DNA, Bonds, Calibration, Simulation

Operates on the same DB tables as V1 but exposes V2-specific views:
- Personality = agent emotional config reframed as "DNA"
- Bonds = emotional_state rows reframed as user-agent relationships
- Calibration = trigger_calibration_json parsed into structured profiles
- Simulation = dry-run trigger detection + state computation
"""
import json
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from db.connection import get_db
from db.repositories import EmotionalStateRepository, AgentRepository
from dependencies import verify_token, get_user_id
from services.emotion_engine import (
    EmotionEngine, EmotionalState, AgentProfile,
    ContextualTriggerCalibration, TriggerCalibration,
    normalize_trigger, ALL_TRIGGERS,
    MOOD_GROUPS, get_mood_valence_arousal,
)

router = APIRouter(
    prefix="/api/designer/v2",
    tags=["designer-v2"],
    dependencies=[Depends(verify_token)],
)


# ============ Helpers ============

def _parse_profile(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _agent_to_personality(row: dict) -> dict:
    profile = _parse_profile(row.get("emotional_profile"))
    return {
        "id": row["id"],
        "name": row.get("display_name") or row["id"],
        "description": profile.get("description", ""),
        "vrm_model": row.get("vrm_model"),
        "voice_id": row.get("voice_id"),
        # Baseline
        "baseline_valence": row.get("baseline_valence") or 0.0,
        "baseline_arousal": row.get("baseline_arousal") or 0.0,
        "baseline_dominance": row.get("baseline_dominance") or 0.0,
        # Dynamics
        "volatility": row.get("emotional_volatility") or 1.0,
        "recovery_rate": row.get("emotional_recovery") or 0.1,
        "mood_decay_rate": profile.get("mood_decay_rate", 0.3),
        # Mood
        "mood_baseline": profile.get("mood_baseline", {}),
        # Trust
        "trust_gain_rate": profile.get("trust_gain_multiplier", 1.0),
        "trust_loss_rate": profile.get("trust_loss_multiplier", 1.0),
        # Trigger sensitivities
        "trigger_sensitivities": profile.get("trigger_multipliers", {}),
        # Trigger response profiles (per-axis overrides)
        "trigger_responses": profile.get("trigger_responses", {}),
        # Essence traits
        "essence_floors": profile.get("essence_floors", {}),
        "essence_ceilings": profile.get("essence_ceilings", {}),
    }


def _bond_from_row(state_row: dict, agent_name: str) -> dict:
    """Build a full bond dict from an emotional_state row."""
    mood_weights = {}
    raw_mw = state_row.get("mood_weights_json")
    if raw_mw:
        try:
            mood_weights = json.loads(raw_mw) if isinstance(raw_mw, str) else raw_mw
        except (json.JSONDecodeError, TypeError):
            pass

    # Top 3 moods
    sorted_moods = sorted(mood_weights.items(), key=lambda x: x[1], reverse=True)
    dominant_moods = [m for m, w in sorted_moods[:3] if w > 0.01]

    has_cal = bool(state_row.get("trigger_calibration_json"))

    last_int = state_row.get("last_interaction")
    if last_int and isinstance(last_int, (int, float)):
        from datetime import datetime, timezone
        last_int = datetime.fromtimestamp(last_int, tz=timezone.utc).isoformat()

    return {
        "user_id": state_row["user_id"],
        "agent_id": state_row["agent_id"],
        "agent_name": agent_name,
        "valence": state_row.get("valence") or 0.0,
        "arousal": state_row.get("arousal") or 0.0,
        "dominance": state_row.get("dominance") or 0.0,
        "mood_weights": mood_weights,
        "dominant_moods": dominant_moods,
        "trust": state_row.get("trust") or 0.5,
        "intimacy": state_row.get("intimacy") or 0.2,
        "playfulness_safety": state_row.get("playfulness_safety") or 0.5,
        "conflict_tolerance": state_row.get("conflict_tolerance") or 0.7,
        "familiarity": state_row.get("familiarity") or 0.0,
        "attachment": state_row.get("attachment") or 0.3,
        "last_interaction": last_int,
        "interaction_count": state_row.get("interaction_count") or 0,
        "has_calibration": has_cal,
    }


# ============ PERSONALITY ============

@router.get("/personalities")
async def list_personalities() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM agents ORDER BY display_name").fetchall()
    return [_agent_to_personality(dict(r)) for r in rows]


@router.get("/personalities/{agent_id}")
async def get_personality(agent_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    return _agent_to_personality(dict(row))


@router.put("/personalities/{agent_id}")
async def update_personality(agent_id: str, config: dict[str, Any]) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
        row = dict(row)

        profile = _parse_profile(row.get("emotional_profile"))

        # Column-level updates
        col_updates = []
        col_params = []
        col_map = {
            "name": "display_name",
            "baseline_valence": "baseline_valence",
            "baseline_arousal": "baseline_arousal",
            "baseline_dominance": "baseline_dominance",
            "volatility": "emotional_volatility",
            "recovery_rate": "emotional_recovery",
            "vrm_model": "vrm_model",
            "voice_id": "voice_id",
        }
        for api_key, col_name in col_map.items():
            if api_key in config:
                col_updates.append(f"{col_name} = ?")
                col_params.append(config[api_key])

        # Profile-level updates
        profile_map = {
            "mood_decay_rate": "mood_decay_rate",
            "mood_baseline": "mood_baseline",
            "trust_gain_rate": "trust_gain_multiplier",
            "trust_loss_rate": "trust_loss_multiplier",
            "trigger_sensitivities": "trigger_multipliers",
            "trigger_responses": "trigger_responses",
            "description": "description",
            "essence_floors": "essence_floors",
            "essence_ceilings": "essence_ceilings",
        }
        for api_key, prof_key in profile_map.items():
            if api_key in config:
                profile[prof_key] = config[api_key]

        col_updates.append("emotional_profile = ?")
        col_params.append(json.dumps(profile))
        col_params.append(agent_id)

        conn.execute(
            f"UPDATE agents SET {', '.join(col_updates)} WHERE id = ?",
            col_params
        )
        conn.commit()

        updated = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return _agent_to_personality(dict(updated))


# ============ TRIGGER DEFAULTS ============

@router.get("/trigger-defaults")
async def get_trigger_defaults() -> dict:
    """Return DEFAULT_TRIGGER_DELTAS for all 15 canonical triggers."""
    return {t: EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(t, {}) for t in ALL_TRIGGERS}


# ============ MOOD GROUPS ============

@router.get("/mood-groups")
async def get_mood_groups() -> dict:
    """Return mood groups with labels, colors, and per-mood V/A coordinates."""
    va_map = get_mood_valence_arousal()
    result = {}
    for group_id, group_info in MOOD_GROUPS.items():
        moods = {}
        for mood_id in group_info["moods"]:
            va = va_map.get(mood_id)
            if va:
                moods[mood_id] = {"valence": va[0], "arousal": va[1]}
        result[group_id] = {
            "label": group_info["label"],
            "color": group_info["color"],
            "moods": moods,
        }
    return result


# ============ BONDS ============

@router.get("/bonds")
async def list_bonds(agent_id: str | None = Query(None)) -> list[dict]:
    with get_db() as conn:
        if agent_id:
            rows = conn.execute(
                """SELECT es.*, a.display_name as agent_display_name
                   FROM emotional_state es
                   JOIN agents a ON a.id = es.agent_id
                   WHERE es.agent_id = ?
                   ORDER BY es.interaction_count DESC""",
                (agent_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT es.*, a.display_name as agent_display_name
                   FROM emotional_state es
                   JOIN agents a ON a.id = es.agent_id
                   ORDER BY es.interaction_count DESC"""
            ).fetchall()

    return [
        {
            "user_id": r["user_id"],
            "agent_id": r["agent_id"],
            "agent_name": r["agent_display_name"] or r["agent_id"],
            "trust": r.get("trust") or 0.5,
            "intimacy": r.get("intimacy") or 0.2,
            "interaction_count": r.get("interaction_count") or 0,
            "last_interaction": r.get("last_interaction"),
        }
        for r in rows
    ]


@router.get("/bonds/{user_id}/{agent_id}")
async def get_bond(user_id: str, agent_id: str) -> dict:
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    agent = AgentRepository.get_by_id(agent_id)
    agent_name = (agent.get("display_name") or agent_id) if agent else agent_id
    return _bond_from_row(dict(state_row), agent_name)


@router.post("/bonds/compare")
async def compare_bonds(body: dict[str, Any]) -> list[dict]:
    agent_id = body.get("agent_id")
    user_ids = body.get("user_ids", [])
    if not agent_id or not user_ids:
        raise HTTPException(status_code=400, detail="agent_id and user_ids required")

    agent = AgentRepository.get_by_id(agent_id)
    agent_name = (agent.get("display_name") or agent_id) if agent else agent_id

    bonds = []
    for uid in user_ids:
        state_row = EmotionalStateRepository.get_or_create(uid, agent_id)
        bonds.append(_bond_from_row(dict(state_row), agent_name))
    return bonds


@router.delete("/bonds/{user_id}/{agent_id}")
async def reset_bond(user_id: str, agent_id: str) -> dict:
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    baseline_v = agent.get("baseline_valence") or 0.0
    baseline_a = agent.get("baseline_arousal") or 0.0
    baseline_d = agent.get("baseline_dominance") or 0.0

    # Load mood_baseline from agent profile so mood_weights resets to it
    profile = _parse_profile(agent.get("emotional_profile"))
    mood_baseline = profile.get("mood_baseline") or {}

    EmotionalStateRepository.update(
        user_id, agent_id,
        mood_weights=mood_baseline if mood_baseline else None,
        valence=baseline_v, arousal=baseline_a, dominance=baseline_d,
        trust=0.5, attachment=0.3, familiarity=0.0,
        intimacy=0.2, playfulness_safety=0.5, conflict_tolerance=0.7,
    )
    EmotionalStateRepository.update_calibration_json(user_id, agent_id, {})
    return {"reset": True}


@router.post("/personalities/{agent_id}/reset-mood-state")
async def reset_mood_state(agent_id: str) -> dict:
    """Reset ALL users' mood_weights + VAD back to the agent's baseline.

    This is a designer admin action — it resets every user-agent pair for this
    agent. Does NOT touch relationship dimensions (trust, intimacy, etc.).
    """
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    profile = _parse_profile(agent.get("emotional_profile"))
    mood_baseline = profile.get("mood_baseline") or {}

    baseline_v = agent.get("baseline_valence") or 0.0
    baseline_a = agent.get("baseline_arousal") or 0.0
    baseline_d = agent.get("baseline_dominance") or 0.0

    now = time.time()
    with get_db() as conn:
        result = conn.execute(
            """UPDATE emotional_state
               SET valence = ?, arousal = ?, dominance = ?,
                   mood_weights_json = ?, last_updated = ?
               WHERE agent_id = ?""",
            (baseline_v, baseline_a, baseline_d,
             json.dumps(mood_baseline) if mood_baseline else None,
             now, agent_id),
        )
        rows_affected = result.rowcount

    return {"reset": True, "mood_weights": mood_baseline, "users_reset": rows_affected}


# ============ CALIBRATION ============

@router.get("/calibration/{user_id}/{agent_id}")
async def get_calibration(user_id: str, agent_id: str) -> dict:
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    agent = AgentRepository.get_by_id(agent_id)
    agent_name = (agent.get("display_name") or agent_id) if agent else agent_id

    raw_cal = state_row.get("trigger_calibration_json")
    cal_data = {}
    if raw_cal:
        try:
            cal_data = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
        except (json.JSONDecodeError, TypeError):
            pass

    calibrations = []
    for trigger_type, cal_dict in cal_data.items():
        if not isinstance(cal_dict, dict):
            continue
        ctc = ContextualTriggerCalibration.from_dict(cal_dict)
        global_d = ctc.global_cal.to_dict()

        buckets = []
        for bkey, bcal in ctc.buckets.items():
            parts = bkey.split("_")
            trust_level = parts[0] if len(parts) > 0 else "mid"
            arousal_level = parts[1] if len(parts) > 1 else "calm"
            recent_conflict = (parts[2] == "conflict") if len(parts) > 2 else False

            bd = bcal.to_dict()
            bd.pop("trigger_type", None)
            buckets.append({
                "key": bkey,
                "trust_level": trust_level,
                "arousal_level": arousal_level,
                "recent_conflict": recent_conflict,
                "calibration": {
                    "trigger_type": trigger_type,
                    **bd,
                },
            })

        global_d.pop("trigger_type", None)
        calibrations.append({
            "trigger_type": trigger_type,
            "global": {
                "trigger_type": trigger_type,
                **global_d,
            },
            "buckets": buckets,
        })

    return {
        "user_id": user_id,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "calibrations": calibrations,
        "total_interactions": state_row.get("interaction_count") or 0,
    }


@router.delete("/calibration/{user_id}/{agent_id}")
async def reset_all_calibration(user_id: str, agent_id: str) -> dict:
    EmotionalStateRepository.update_calibration_json(user_id, agent_id, {})
    return {"reset": True}


@router.delete("/calibration/{user_id}/{agent_id}/{trigger_type}")
async def reset_trigger_calibration(user_id: str, agent_id: str, trigger_type: str) -> dict:
    cal = EmotionalStateRepository.get_calibration_json(user_id, agent_id)
    canonical = normalize_trigger(trigger_type) or trigger_type
    cal.pop(canonical, None)
    cal.pop(trigger_type, None)
    EmotionalStateRepository.update_calibration_json(user_id, agent_id, cal)
    return {"reset": trigger_type}


# ============ SIMULATION ============

@router.post("/simulate")
async def simulate(body: dict[str, Any]) -> dict:
    agent_id = body.get("agent_id")
    user_id = body.get("user_id")
    message = body.get("message", "")

    if not agent_id or not user_id:
        raise HTTPException(status_code=400, detail="agent_id and user_id required")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
    profile = AgentProfile.from_db(agent, profile_data)
    engine = EmotionEngine(profile)

    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    raw_cal = state_row.get("trigger_calibration_json")
    calibrations: dict[str, ContextualTriggerCalibration] = {}
    if raw_cal:
        try:
            cal_data = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
            for k, v in cal_data.items():
                if isinstance(v, dict):
                    calibrations[k] = ContextualTriggerCalibration.from_dict(v)
        except (json.JSONDecodeError, TypeError):
            pass

    state = EmotionalState(
        valence=state_row.get("valence") or 0.0,
        arousal=state_row.get("arousal") or 0.0,
        dominance=state_row.get("dominance") or 0.0,
        trust=state_row.get("trust") or 0.5,
        attachment=state_row.get("attachment") or 0.3,
        familiarity=state_row.get("familiarity") or 0.0,
        intimacy=state_row.get("intimacy") or 0.2,
        playfulness_safety=state_row.get("playfulness_safety") or 0.5,
        conflict_tolerance=state_row.get("conflict_tolerance") or 0.7,
        trigger_calibration=calibrations,
        mood_weights=json.loads(state_row["mood_weights_json"]) if state_row.get("mood_weights_json") else {},
    )

    state_before = state.to_dict()
    triggers = engine.detect_triggers(message)

    trigger_details = []
    for trigger, intensity in triggers:
        canonical = normalize_trigger(trigger)
        has_response = trigger in profile_data.get("trigger_responses", {})
        dna_sens = 1.0 if has_response else profile.trigger_multipliers.get(trigger, 1.0)
        cal = calibrations.get(canonical) if canonical else None
        cal_mult = 1.0
        if cal:
            from services.emotion_engine import ContextBucket
            ctx = ContextBucket.from_state(state)
            cal_mult = cal.get_multiplier(ctx)

        engine.apply_trigger_calibrated(state, trigger, intensity, cal)

        effective = intensity * dna_sens * cal_mult * profile.emotional_volatility
        # Per-axis deltas for direction visualization
        axis_deltas = profile.get_trigger_deltas(trigger)
        trigger_details.append({
            "trigger": trigger,
            "raw_intensity": round(intensity, 3),
            "effective_intensity": round(effective, 3),
            "dna_sensitivity": round(dna_sens, 2),
            "calibration_multiplier": round(cal_mult, 2),
            "axis_deltas": {k: round(v, 3) for k, v in axis_deltas.items()},
        })

    state_after = state.to_dict()
    dimension_deltas = {
        k: round(state_after.get(k, 0) - state_before.get(k, 0), 4)
        for k in ("valence", "arousal", "dominance", "trust", "intimacy",
                   "playfulness_safety", "conflict_tolerance", "attachment", "familiarity")
        if state_after.get(k, 0) != state_before.get(k, 0)
    }

    # Compute mood shifts via V/A dot product projection
    va_delta = {
        'valence': state_after.get('valence', 0) - state_before.get('valence', 0),
        'arousal': state_after.get('arousal', 0) - state_before.get('arousal', 0),
    }
    mood_shifts = {k: round(v, 3) for k, v in engine.calculate_mood_deltas_from_va(va_delta).items()
                   if abs(v) > 0.001}

    context_block = engine.generate_context_block(state)

    return {
        "detected_triggers": trigger_details,
        "state_before": state_before,
        "state_after": state_after,
        "dimension_deltas": dimension_deltas,
        "mood_shifts": mood_shifts,
        "context_block": context_block,
    }
