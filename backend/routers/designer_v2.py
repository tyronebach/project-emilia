"""Designer V2 API — Personality DNA, Bonds, Calibration, Simulation

Operates on the same DB tables as V1 but exposes V2-specific views:
- Personality = agent emotional config reframed as "DNA"
- Bonds = emotional_state rows reframed as user-agent relationships
- Calibration = trigger_calibration_json parsed into structured profiles
- Simulation = dry-run trigger detection + state computation
"""
import json
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from core.exceptions import not_found, bad_request

from db.connection import get_db
from db.repositories import (
    EmotionalStateRepository,
    AgentRepository,
    AppSettingsRepository,
    ArchetypeRepository,
)
from dependencies import verify_token
from services.emotion_engine import (
    EmotionEngine, EmotionalState, AgentProfile,
    ContextualTriggerCalibration,
    normalize_trigger, ALL_TRIGGERS,
    MOOD_GROUPS, get_mood_valence_arousal, DEFAULT_MOOD_INJECTION_SETTINGS,
    clamp_injection_settings,
)
from services.drift_simulator import (
    DriftSimulationConfig,
    DriftSimulator,
)

router = APIRouter(
    prefix="/api/designer/v2",
    tags=["designer-v2"],
    dependencies=[Depends(verify_token)],
)

ARCHETYPE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")
MAX_GENERATE_FILE_BYTES = 2 * 1024 * 1024
MAX_GENERATE_LINES = 2000
MAX_GENERATE_LINE_CHARS = 300


def _validate_archetype_id(archetype_id: str) -> str:
    normalized = (archetype_id or "").strip().lower()
    if not normalized or not ARCHETYPE_ID_RE.fullmatch(normalized):
        raise bad_request("Invalid archetype id. Use lowercase letters, numbers, hyphen, underscore.")
    return normalized


def _parse_outcome_weights(raw: Any) -> dict[str, float]:
    if raw is None or raw == "":
        return ArchetypeRepository.normalize_outcome_weights(None)

    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise bad_request("Invalid outcome_weights JSON") from exc

    if not isinstance(data, dict):
        raise bad_request("outcome_weights must be a JSON object")
    return ArchetypeRepository.normalize_outcome_weights(data)


def _normalize_message_triggers(raw: Any) -> list[list[list[str | float]]]:
    if not isinstance(raw, list):
        raise bad_request("message_triggers must be an array")

    normalized: list[list[list[str | float]]] = []
    for idx, item in enumerate(raw):
        if not isinstance(item, list):
            raise bad_request(f"message_triggers[{idx}] must be an array")

        trigger_map: dict[str, float] = {}
        for pair in item:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                raise bad_request("Each trigger entry must be [trigger, intensity]")

            trigger_raw, intensity_raw = pair
            trigger = normalize_trigger(str(trigger_raw).strip().lower()) or str(trigger_raw).strip().lower()
            if trigger not in EmotionEngine.DEFAULT_TRIGGER_DELTAS:
                raise bad_request(f"Unknown trigger in message_triggers: {trigger_raw}")

            try:
                intensity = float(intensity_raw)
            except (TypeError, ValueError) as exc:
                raise bad_request(f"Invalid intensity for trigger '{trigger}'") from exc

            if intensity < 0.0 or intensity > 1.0:
                raise bad_request(f"Intensity must be between 0.0 and 1.0 for trigger '{trigger}'")

            if trigger not in trigger_map or intensity > trigger_map[trigger]:
                trigger_map[trigger] = intensity

        ordered = sorted(trigger_map.items(), key=lambda item: item[1], reverse=True)
        normalized.append([[trigger, float(f"{confidence:.4f}")] for trigger, confidence in ordered])

    return normalized

def _build_drift_result_payload(result) -> dict:
    """Serialize full drift simulation payload (legacy/UI format)."""
    return {
        "config": result.config.__dict__,
        "timeline": [p.__dict__ for p in result.timeline],
        "daily_summaries": [s.__dict__ for s in result.daily_summaries],
        "start_state": result.start_state,
        "end_state": result.end_state,
        "drift_vector": result.drift_vector,
        "mood_distribution": result.mood_distribution,
        "trigger_stats": [t.__dict__ for t in result.trigger_stats],
        "stability_score": result.stability_score,
        "recovery_rate": result.recovery_rate,
        "significant_events": result.significant_events,
    }


def _top_items(items: dict[str, float], n: int = 3) -> list[dict[str, float | str]]:
    ranked = sorted(items.items(), key=lambda x: x[1], reverse=True)[:n]
    return [{"id": k, "value": v} for k, v in ranked]


def _build_event_counts(events: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for event in events:
        key = str(event.get("event") or "unknown")
        counts[key] = counts.get(key, 0) + 1
    return counts


def _build_drift_summary(result, include_config: bool = False) -> dict:
    """Compact drift summary for automation/LLM tuning loops."""
    start = result.start_state or {}
    end = result.end_state or {}
    core_keys = ("valence", "arousal", "trust", "intimacy")

    start_core = {k: float(start.get(k, 0.0)) for k in core_keys}
    end_core = {k: float(end.get(k, 0.0)) for k in core_keys}
    core_drift = {k: float(result.drift_vector.get(k, 0.0)) for k in core_keys}

    event_counts = _build_event_counts(result.significant_events or [])
    top_moods = _top_items(result.mood_distribution or {}, n=3)
    top_triggers = [
        {
            "trigger": t.trigger,
            "count": t.count,
            "avg_valence_delta": t.avg_valence_delta,
            "avg_trust_delta": t.avg_trust_delta,
        }
        for t in (result.trigger_stats or [])[:5]
    ]

    risk_flags = {
        "negative_drift": core_drift["valence"] < -0.15,
        "trust_erosion": core_drift["trust"] < -0.1 or end_core["trust"] < 0.35,
        "low_stability": float(result.stability_score) < 0.55,
        "slow_recovery": float(result.recovery_rate) < 0.45,
    }

    tuning_hints: list[str] = []
    if risk_flags["negative_drift"]:
        tuning_hints.append("Raise baseline_valence or reduce volatility for negative triggers.")
    if risk_flags["trust_erosion"]:
        tuning_hints.append("Increase trust_gain_rate and/or soften trust-negative trigger responses.")
    if risk_flags["low_stability"]:
        tuning_hints.append("Lower volatility or increase recovery_rate to reduce oscillation.")
    if risk_flags["slow_recovery"]:
        tuning_hints.append("Increase recovery_rate or mood_decay_rate for faster baseline return.")
    if not tuning_hints:
        tuning_hints.append("Current profile appears stable for this archetype and timeframe.")

    summary = {
        "messages_simulated": len(result.timeline or []),
        "scorecard": {
            "start_core": start_core,
            "end_core": end_core,
            "core_drift": core_drift,
            "stability_score": float(result.stability_score),
            "recovery_rate": float(result.recovery_rate),
        },
        "top_moods": top_moods,
        "top_triggers": top_triggers,
        "significant_event_counts": event_counts,
        "risk_flags": risk_flags,
        "tuning_hints": tuning_hints,
    }
    if include_config:
        summary["config"] = result.config.__dict__
    return summary


def _run_drift_simulation(
    *,
    agent_id: str,
    archetype: str,
    user_id: str = "sim-user",
    duration_days: int = 7,
    sessions_per_day: int = 2,
    messages_per_session: int = 20,
    session_gap_hours: float = 8.0,
    overnight_gap_hours: float = 12.0,
    seed: int | None = None,
    replay_mode: str = "sequential",
):
    if not agent_id or not archetype:
        raise bad_request("agent_id and archetype required")

    if duration_days <= 0 or sessions_per_day <= 0 or messages_per_session <= 0:
        raise bad_request("duration_days, sessions_per_day, messages_per_session must be positive")

    replay_mode = (replay_mode or "sequential").strip().lower()
    if replay_mode not in {"sequential", "random"}:
        raise bad_request("replay_mode must be 'sequential' or 'random'")

    config = DriftSimulationConfig(
        agent_id=agent_id,
        user_id=user_id,
        archetype=archetype,
        duration_days=duration_days,
        sessions_per_day=sessions_per_day,
        messages_per_session=messages_per_session,
        session_gap_hours=session_gap_hours,
        overnight_gap_hours=overnight_gap_hours,
        seed=seed,
        replay_mode=replay_mode,  # type: ignore[arg-type]
    )

    try:
        simulator = DriftSimulator(config)
        return simulator.run()
    except ValueError as exc:
        raise bad_request(str(exc)) from exc


# ============ Helpers ============

def _agent_to_personality(row: dict) -> dict:
    profile = AgentRepository.parse_profile(row.get("emotional_profile"))
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
        # Asymmetry tuning
        "valence_gain_multiplier": profile.get("valence_gain_multiplier", 0.95),
        "valence_loss_multiplier": profile.get("valence_loss_multiplier", 1.1),
        "bond_gain_multiplier": profile.get("bond_gain_multiplier", 0.95),
        "bond_loss_multiplier": profile.get("bond_loss_multiplier", 1.1),
        "mood_gain_multiplier": profile.get("mood_gain_multiplier", 0.9),
        "mood_loss_multiplier": profile.get("mood_loss_multiplier", 1.1),
        # Trigger sensitivities
        "trigger_sensitivities": profile.get("trigger_multipliers", {}),
        # Trigger response profiles (per-axis overrides)
        "trigger_responses": profile.get("trigger_responses", {}),
        # Essence traits
        "essence_floors": profile.get("essence_floors", {}),
        "essence_ceilings": profile.get("essence_ceilings", {}),
    }


def _extract_agent_id(config: dict[str, Any]) -> str | None:
    """Read target agent id from request body, if present."""
    for key in ("agent_id", "id"):
        raw = config.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def _bond_from_row(state_row: dict, agent_name: str) -> dict:
    """Build a full bond dict from an emotional_state row."""
    mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)

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
        "valence": state_row.get("valence") if state_row.get("valence") is not None else 0.0,
        "arousal": state_row.get("arousal") if state_row.get("arousal") is not None else 0.0,
        "dominance": state_row.get("dominance") if state_row.get("dominance") is not None else 0.0,
        "mood_weights": mood_weights,
        "dominant_moods": dominant_moods,
        "trust": state_row.get("trust") if state_row.get("trust") is not None else 0.5,
        "intimacy": state_row.get("intimacy") if state_row.get("intimacy") is not None else 0.2,
        "playfulness_safety": state_row.get("playfulness_safety") if state_row.get("playfulness_safety") is not None else 0.5,
        "conflict_tolerance": state_row.get("conflict_tolerance") if state_row.get("conflict_tolerance") is not None else 0.7,
        "familiarity": state_row.get("familiarity") if state_row.get("familiarity") is not None else 0.0,
        "attachment": state_row.get("attachment") if state_row.get("attachment") is not None else 0.3,
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
        raise not_found(f"Agent {agent_id}")
    return _agent_to_personality(dict(row))


@router.put("/personalities/{agent_id}")
async def update_personality(agent_id: str, config: dict[str, Any]) -> dict:
    payload_agent_id = _extract_agent_id(config)
    if payload_agent_id and payload_agent_id != agent_id:
        raise bad_request(
            f"agent id mismatch: path agent_id='{agent_id}' does not match payload '{payload_agent_id}'"
        )

    with get_db() as conn:
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if not row:
            raise not_found(f"Agent {agent_id}")
        row = dict(row)

        profile = AgentRepository.parse_profile(row.get("emotional_profile"))

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
            "valence_gain_multiplier": "valence_gain_multiplier",
            "valence_loss_multiplier": "valence_loss_multiplier",
            "bond_gain_multiplier": "bond_gain_multiplier",
            "bond_loss_multiplier": "bond_loss_multiplier",
            "mood_gain_multiplier": "mood_gain_multiplier",
            "mood_loss_multiplier": "mood_loss_multiplier",
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


@router.post("/personalities/apply")
async def apply_personality(
    config: dict[str, Any],
    full: bool = Query(False, description="Return full personality payload when true."),
    simulate_archetype: str | None = Query(None, description="Optional archetype id to run drift summary immediately after apply."),
    simulate_user_id: str = Query("sim-user", description="Simulation user id when simulate_archetype is set."),
    simulate_duration_days: int = Query(7, description="Simulation duration in days when simulate_archetype is set."),
    simulate_sessions_per_day: int = Query(2, description="Simulation sessions/day when simulate_archetype is set."),
    simulate_messages_per_session: int = Query(20, description="Simulation messages/session when simulate_archetype is set."),
    simulate_session_gap_hours: float = Query(8.0, description="Simulation intra-day gap in hours when simulate_archetype is set."),
    simulate_overnight_gap_hours: float = Query(12.0, description="Simulation overnight gap in hours when simulate_archetype is set."),
    simulate_seed: int | None = Query(None, description="Optional deterministic seed when simulate_archetype is set."),
    simulate_replay_mode: str = Query("sequential", description="Simulation replay mode when simulate_archetype is set."),
    simulate_include_config: bool = Query(False, description="Include resolved simulation config in simulation_summary."),
) -> dict:
    """Apply a personality payload that includes `agent_id` (or `id`).

    Returns a compact ack by default for low-token automation clients.
    """
    agent_id = _extract_agent_id(config)
    if not agent_id:
        raise bad_request("Missing agent id in payload. Provide `agent_id` (or `id`).")
    updated = await update_personality(agent_id, config)

    if simulate_archetype:
        sim_result = _run_drift_simulation(
            agent_id=updated["id"],
            user_id=simulate_user_id,
            archetype=simulate_archetype,
            duration_days=simulate_duration_days,
            sessions_per_day=simulate_sessions_per_day,
            messages_per_session=simulate_messages_per_session,
            session_gap_hours=simulate_session_gap_hours,
            overnight_gap_hours=simulate_overnight_gap_hours,
            seed=simulate_seed,
            replay_mode=simulate_replay_mode,
        )
        response = {
            "ok": True,
            "agent_id": updated["id"],
            "name": updated["name"],
            "simulation_summary": _build_drift_summary(sim_result, include_config=simulate_include_config),
        }
        if full:
            response["personality"] = updated
        return response

    if full:
        return updated
    return {
        "ok": True,
        "agent_id": updated["id"],
        "name": updated["name"],
    }


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


@router.get("/mood-injection-settings")
async def get_mood_injection_settings() -> dict:
    raw = AppSettingsRepository.get_json("mood_injection_settings", DEFAULT_MOOD_INJECTION_SETTINGS)
    return clamp_injection_settings(raw)


@router.put("/mood-injection-settings")
async def update_mood_injection_settings(body: dict[str, Any]) -> dict:
    sanitized = clamp_injection_settings(body)
    AppSettingsRepository.set_json("mood_injection_settings", sanitized)
    return sanitized


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
        raise bad_request("agent_id and user_ids required")

    agent = AgentRepository.get_by_id(agent_id)
    agent_name = (agent.get("display_name") or agent_id) if agent else agent_id

    bonds = []
    for uid in user_ids:
        state_row = EmotionalStateRepository.get(uid, agent_id)
        if state_row:
            bonds.append(_bond_from_row(dict(state_row), agent_name))
    return bonds


@router.delete("/bonds/{user_id}/{agent_id}")
async def reset_bond(user_id: str, agent_id: str) -> dict:
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")

    baseline_v = agent.get("baseline_valence") or 0.0
    baseline_a = agent.get("baseline_arousal") or 0.0
    baseline_d = agent.get("baseline_dominance") or 0.0

    # Load mood_baseline from agent profile so mood_weights resets to it
    profile = AgentRepository.parse_profile(agent.get("emotional_profile"))
    mood_baseline = profile.get("mood_baseline") or {}

    EmotionalStateRepository.update(
        user_id, agent_id,
        increment_interaction=False,
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
        raise not_found("Agent")

    profile = AgentRepository.parse_profile(agent.get("emotional_profile"))
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
        raise bad_request("agent_id and user_id required")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")

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

    mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)
    state = EmotionalState.from_db_row(state_row, calibrations=calibrations, mood_weights=mood_weights)

    state_before = state.to_dict()
    triggers = engine.detect_triggers(message)

    trigger_details = []
    for trigger, intensity in triggers:
        canonical = normalize_trigger(trigger)
        cal = calibrations.get(canonical) if canonical else None

        # Use same formula as the actual engine (M3 fix)
        effective = engine.compute_effective_delta(trigger, intensity, state, cal)
        engine.apply_trigger_calibrated(state, trigger, intensity, cal)

        # Per-axis deltas for direction visualization
        axis_deltas = profile.get_trigger_deltas(trigger)
        trigger_details.append({
            "trigger": trigger,
            "raw_intensity": round(intensity, 3),
            "effective_intensity": round(effective, 3),
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


@router.get("/archetypes")
async def list_archetypes() -> dict:
    rows = ArchetypeRepository.list_all()
    return {"archetypes": rows}


@router.get("/archetypes/{archetype_id}")
async def get_archetype(archetype_id: str) -> dict:
    archetype = ArchetypeRepository.get(archetype_id)
    if not archetype:
        raise not_found(f"Archetype {archetype_id}")
    return archetype


@router.post("/archetypes")
async def create_archetype(body: dict[str, Any]) -> dict:
    archetype_id = _validate_archetype_id(str(body.get("id") or ""))
    name = (body.get("name") or "").strip()
    if not name:
        raise bad_request("name is required")

    message_triggers = _normalize_message_triggers(body.get("message_triggers"))
    if not message_triggers:
        raise bad_request("message_triggers cannot be empty")

    outcome_weights = _parse_outcome_weights(body.get("outcome_weights"))

    try:
        created = ArchetypeRepository.create(
            {
                "id": archetype_id,
                "name": name,
                "description": (body.get("description") or "").strip(),
                "message_triggers": message_triggers,
                "outcome_weights": outcome_weights,
                "sample_count": int(body.get("sample_count") or len(message_triggers)),
                "source_filename": body.get("source_filename"),
            }
        )
    except ValueError as exc:
        raise bad_request(str(exc)) from exc

    return created


@router.post("/archetypes/generate")
async def generate_archetype(
    file: UploadFile = File(...),
    id: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    outcome_weights: str | None = Form(None),
) -> dict:
    archetype_id = _validate_archetype_id(id)
    normalized_name = (name or "").strip()
    if not normalized_name:
        raise bad_request("name is required")

    payload = await file.read(MAX_GENERATE_FILE_BYTES + 1)
    if len(payload) > MAX_GENERATE_FILE_BYTES:
        raise bad_request(f"File exceeds max size ({MAX_GENERATE_FILE_BYTES} bytes)")

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise bad_request("File must be UTF-8 text") from exc

    messages: list[str] = []
    for line in text.splitlines():
        normalized = line.strip()
        if not normalized:
            continue
        if len(normalized) > MAX_GENERATE_LINE_CHARS:
            raise bad_request(
                f"Line exceeds max length ({MAX_GENERATE_LINE_CHARS} chars)"
            )
        messages.append(normalized)
        if len(messages) > MAX_GENERATE_LINES:
            raise bad_request(f"File exceeds max non-empty lines ({MAX_GENERATE_LINES})")

    if not messages:
        raise bad_request("No messages found in file")

    parsed_outcomes = _parse_outcome_weights(outcome_weights)

    try:
        created = ArchetypeRepository.generate_from_messages(
            archetype_id=archetype_id,
            name=normalized_name,
            description=(description or "").strip(),
            messages=messages,
            source_filename=file.filename,
            outcome_weights=parsed_outcomes,
        )
    except ValueError as exc:
        raise bad_request(str(exc)) from exc

    return {
        "id": created["id"],
        "name": created["name"],
        "description": created.get("description") or "",
        "sample_count": created.get("sample_count") or len(messages),
        "trigger_distribution": created.get("trigger_distribution", {}),
    }


@router.put("/archetypes/{archetype_id}")
async def update_archetype(archetype_id: str, body: dict[str, Any]) -> dict:
    updates: dict[str, Any] = {}

    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            raise bad_request("name cannot be empty")
        updates["name"] = name

    if "description" in body:
        updates["description"] = (body.get("description") or "").strip()

    if "outcome_weights" in body:
        updates["outcome_weights"] = _parse_outcome_weights(body.get("outcome_weights"))

    if "message_triggers" in body:
        message_triggers = _normalize_message_triggers(body.get("message_triggers"))
        updates["message_triggers"] = message_triggers
        updates["sample_count"] = int(body.get("sample_count") or len(message_triggers))

    if not updates:
        existing = ArchetypeRepository.get(archetype_id)
        if not existing:
            raise not_found(f"Archetype {archetype_id}")
        return existing

    updated = ArchetypeRepository.update(archetype_id, updates)
    if not updated:
        raise not_found(f"Archetype {archetype_id}")
    return updated


@router.delete("/archetypes/{archetype_id}")
async def delete_archetype(archetype_id: str) -> dict:
    deleted = ArchetypeRepository.delete(archetype_id)
    if not deleted:
        raise not_found(f"Archetype {archetype_id}")
    return {"deleted": True, "id": archetype_id}


@router.post("/drift-simulate")
async def drift_simulate(body: dict[str, Any]) -> dict:
    agent_id = body.get("agent_id")
    user_id = body.get("user_id", "sim-user")
    archetype = body.get("archetype")
    replay_mode = str(body.get("replay_mode", "sequential"))

    duration_days = int(body.get("duration_days", 7))
    sessions_per_day = int(body.get("sessions_per_day", 2))
    messages_per_session = int(body.get("messages_per_session", 20))
    session_gap_hours = float(body.get("session_gap_hours", 8))
    overnight_gap_hours = float(body.get("overnight_gap_hours", 12))
    seed = body.get("seed")
    seed = int(seed) if seed is not None and seed != "" else None

    result = _run_drift_simulation(
        agent_id=agent_id,
        user_id=user_id,
        archetype=archetype,
        duration_days=duration_days,
        sessions_per_day=sessions_per_day,
        messages_per_session=messages_per_session,
        session_gap_hours=session_gap_hours,
        overnight_gap_hours=overnight_gap_hours,
        seed=seed,
        replay_mode=replay_mode,
    )

    return _build_drift_result_payload(result)


@router.post("/drift-simulate-summary")
async def drift_simulate_summary(
    body: dict[str, Any],
    include_config: bool = Query(False, description="Include resolved simulation config in response."),
) -> dict:
    """Run drift simulation and return compact summary for automation clients."""
    agent_id = body.get("agent_id")
    user_id = body.get("user_id", "sim-user")
    archetype = body.get("archetype")
    replay_mode = str(body.get("replay_mode", "sequential"))

    duration_days = int(body.get("duration_days", 7))
    sessions_per_day = int(body.get("sessions_per_day", 2))
    messages_per_session = int(body.get("messages_per_session", 20))
    session_gap_hours = float(body.get("session_gap_hours", 8))
    overnight_gap_hours = float(body.get("overnight_gap_hours", 12))
    seed = body.get("seed")
    seed = int(seed) if seed is not None and seed != "" else None

    result = _run_drift_simulation(
        agent_id=agent_id,
        user_id=user_id,
        archetype=archetype,
        duration_days=duration_days,
        sessions_per_day=sessions_per_day,
        messages_per_session=messages_per_session,
        session_gap_hours=session_gap_hours,
        overnight_gap_hours=overnight_gap_hours,
        seed=seed,
        replay_mode=replay_mode,
    )

    return _build_drift_summary(result, include_config=include_config)


@router.post("/drift-compare")
async def drift_compare(body: dict[str, Any]) -> dict:
    agent_id = body.get("agent_id")
    archetypes = body.get("archetypes") or []
    replay_mode = str(body.get("replay_mode", "sequential"))

    duration_days = int(body.get("duration_days", 7))
    sessions_per_day = int(body.get("sessions_per_day", 2))
    messages_per_session = int(body.get("messages_per_session", 20))
    session_gap_hours = float(body.get("session_gap_hours", 8))
    overnight_gap_hours = float(body.get("overnight_gap_hours", 12))
    seed = body.get("seed")
    seed = int(seed) if seed is not None and seed != "" else None

    if not agent_id or not archetypes:
        raise bad_request("agent_id and archetypes required")

    comparisons = []
    for archetype in archetypes:
        result = _run_drift_simulation(
            agent_id=agent_id,
            user_id="sim-user",
            archetype=archetype,
            duration_days=duration_days,
            sessions_per_day=sessions_per_day,
            messages_per_session=messages_per_session,
            session_gap_hours=session_gap_hours,
            overnight_gap_hours=overnight_gap_hours,
            seed=seed,
            replay_mode=replay_mode,
        )
        comparisons.append({
            "archetype": archetype,
            "result": _build_drift_result_payload(result),
        })

    return {"comparisons": comparisons}
