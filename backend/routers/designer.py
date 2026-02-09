"""Designer API Router - Agent emotional profiles, moods, and relationship configs

All data stored in SQLite.
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from db.connection import get_db
from db.repositories import MoodRepository, RelationshipTypeRepository
from dependencies import verify_token

router = APIRouter(prefix="/api/designer", tags=["designer"], dependencies=[Depends(verify_token)])


# ============ MOODS (SQLite) ============

@router.get("/moods")
async def list_moods() -> dict[str, Any]:
    """Get mood definitions"""
    rows = MoodRepository.get_all()
    return {
        "moods": [dict(row) for row in rows]
    }


@router.post("/moods")
async def create_mood(config: dict[str, Any]) -> dict:
    """Create a new mood"""
    mood_id = config.get("id")
    if not mood_id:
        raise HTTPException(status_code=400, detail="Mood id is required")

    if MoodRepository.get_by_id(mood_id):
        raise HTTPException(status_code=409, detail=f"Mood {mood_id} already exists")

    valence = config.get("valence")
    arousal = config.get("arousal")
    if valence is None or arousal is None:
        raise HTTPException(status_code=400, detail="valence and arousal are required")

    row = MoodRepository.create(
        mood_id,
        valence=valence,
        arousal=arousal,
        description=config.get("description", ""),
        emoji=config.get("emoji", ""),
        category=config.get("category", "neutral"),
    )
    return dict(row)


@router.put("/moods/{mood_id}")
async def update_mood(mood_id: str, config: dict[str, Any]) -> dict:
    """Update a mood"""
    if not MoodRepository.get_by_id(mood_id):
        raise HTTPException(status_code=404, detail=f"Mood {mood_id} not found")

    row = MoodRepository.update(mood_id, config)
    return dict(row)


@router.delete("/moods/{mood_id}")
async def delete_mood(mood_id: str) -> dict:
    """Delete a mood"""
    deleted = MoodRepository.delete(mood_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Mood {mood_id} not found")
    return {"deleted": mood_id}


# ============ AGENTS (SQLite) ============

def _parse_emotional_profile(profile_str: str | None) -> dict:
    """Parse emotional_profile JSON from DB"""
    if not profile_str:
        return {}
    try:
        return json.loads(profile_str)
    except json.JSONDecodeError:
        return {}


def _agent_row_to_response(row: dict) -> dict:
    """Convert DB row to API response"""
    profile = _parse_emotional_profile(row.get("emotional_profile"))

    return {
        "id": row["id"],
        "name": row.get("display_name") or row["id"],
        "description": profile.get("description", ""),
        "mood_baseline": profile.get("mood_baseline", {}),
        "mood_decay_rate": profile.get("mood_decay_rate", 0.3),
        "volatility": row.get("emotional_volatility") or profile.get("volatility", 1.0),
        "recovery": row.get("emotional_recovery") or profile.get("recovery", 0.1),
        "baseline_valence": row.get("baseline_valence", 0.2),
        "baseline_arousal": row.get("baseline_arousal", 0.0),
        "baseline_dominance": row.get("baseline_dominance", 0.0),
        "decay_rates": profile.get("decay_rates", {}),
        "trigger_multipliers": profile.get("trigger_multipliers", {}),
        "trust_gain_multiplier": profile.get("trust_gain_multiplier", 1.0),
        "trust_loss_multiplier": profile.get("trust_loss_multiplier", 1.0),
        "vrm_model": row.get("vrm_model"),
        "voice_id": row.get("voice_id"),
    }


@router.get("/agents")
async def list_agents() -> list[dict]:
    """List all agents from database"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM agents ORDER BY display_name"
        ).fetchall()

    return [_agent_row_to_response(dict(row)) for row in rows]


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str) -> dict:
    """Get single agent config from database"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    return _agent_row_to_response(dict(row))


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, config: dict[str, Any]) -> dict:
    """Update agent config in database"""
    with get_db() as conn:
        # Check agent exists
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

        row = dict(row)

        # Parse existing profile
        existing_profile = _parse_emotional_profile(row.get("emotional_profile"))

        # Update top-level agent columns if provided
        updates = []
        params = []

        if "name" in config:
            updates.append("display_name = ?")
            params.append(config["name"])

        if "baseline_valence" in config:
            updates.append("baseline_valence = ?")
            params.append(config["baseline_valence"])

        if "baseline_arousal" in config:
            updates.append("baseline_arousal = ?")
            params.append(config["baseline_arousal"])

        if "baseline_dominance" in config:
            updates.append("baseline_dominance = ?")
            params.append(config["baseline_dominance"])

        if "volatility" in config:
            updates.append("emotional_volatility = ?")
            params.append(config["volatility"])

        if "recovery" in config:
            updates.append("emotional_recovery = ?")
            params.append(config["recovery"])

        if "vrm_model" in config:
            updates.append("vrm_model = ?")
            params.append(config["vrm_model"])

        if "voice_id" in config:
            updates.append("voice_id = ?")
            params.append(config["voice_id"])

        # Update emotional_profile JSON for nested fields
        profile_fields = [
            "description", "mood_baseline", "mood_decay_rate",
            "decay_rates", "trigger_multipliers",
            "trust_gain_multiplier", "trust_loss_multiplier",
            "attachment_ceiling", "play_trust_threshold"
        ]

        for field in profile_fields:
            if field in config:
                existing_profile[field] = config[field]

        # Always update the profile JSON
        updates.append("emotional_profile = ?")
        params.append(json.dumps(existing_profile))

        # Execute update
        params.append(agent_id)
        conn.execute(
            f"UPDATE agents SET {', '.join(updates)} WHERE id = ?",
            params
        )
        conn.commit()

        # Return updated agent
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

    return _agent_row_to_response(dict(row))


@router.post("/agents")
async def create_agent(config: dict[str, Any]) -> dict:
    """Create new agent in database"""
    agent_id = config.get("id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="Agent id is required")

    with get_db() as conn:
        # Check if exists
        existing = conn.execute(
            "SELECT id FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

        if existing:
            raise HTTPException(status_code=409, detail=f"Agent {agent_id} already exists")

        # Build emotional_profile JSON
        profile = {
            "description": config.get("description", ""),
            "mood_baseline": config.get("mood_baseline", {}),
            "mood_decay_rate": config.get("mood_decay_rate", 0.3),
            "decay_rates": config.get("decay_rates", {"valence": 0.3, "arousal": 0.4}),
            "trigger_multipliers": config.get("trigger_multipliers", {}),
        }

        conn.execute("""
            INSERT INTO agents (
                id, display_name, clawdbot_agent_id,
                baseline_valence, baseline_arousal, baseline_dominance,
                emotional_volatility, emotional_recovery,
                emotional_profile, vrm_model, voice_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            agent_id,
            config.get("name", agent_id.capitalize()),
            config.get("clawdbot_agent_id", agent_id),
            config.get("baseline_valence", 0.2),
            config.get("baseline_arousal", 0.0),
            config.get("baseline_dominance", 0.0),
            config.get("volatility", 1.0),
            config.get("recovery", 0.1),
            json.dumps(profile),
            config.get("vrm_model", "emilia.vrm"),
            config.get("voice_id"),
        ))
        conn.commit()

        row = conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

    return _agent_row_to_response(dict(row))


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str) -> dict:
    """Delete agent from database"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM agents WHERE id = ?", (agent_id,)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

        conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        conn.commit()

    return {"deleted": agent_id}


# ============ RELATIONSHIPS (SQLite) ============

@router.get("/relationships")
async def list_relationships() -> list[dict]:
    """List all relationship types"""
    rows = RelationshipTypeRepository.get_all()
    return [
        {
            "type": row["id"],
            "description": row.get("description", ""),
            "trigger_count": len(row.get("trigger_mood_map", {})),
        }
        for row in rows
    ]


@router.get("/relationships/{rel_type}")
async def get_relationship(rel_type: str) -> dict:
    """Get single relationship config"""
    row = RelationshipTypeRepository.get_by_id(rel_type)
    if not row:
        raise HTTPException(status_code=404, detail=f"Relationship {rel_type} not found")
    # Return in same shape as the old JSON files: use "type" key = id
    result = dict(row)
    result["type"] = result.pop("id")
    result.pop("created_at", None)
    # Merge extra fields to top level for backwards compatibility
    extra = result.pop("extra", {})
    if extra:
        result.update(extra)
    return result


@router.put("/relationships/{rel_type}")
async def update_relationship(rel_type: str, config: dict[str, Any]) -> dict:
    """Update relationship config"""
    existing = RelationshipTypeRepository.get_by_id(rel_type)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Relationship {rel_type} not found")

    row = RelationshipTypeRepository.update(rel_type, config)
    result = dict(row)
    result["type"] = result.pop("id")
    result.pop("created_at", None)
    extra = result.pop("extra", {})
    if extra:
        result.update(extra)
    return result


@router.post("/relationships/{rel_type}")
async def create_relationship(rel_type: str, config: dict[str, Any]) -> dict:
    """Create new relationship config"""
    if RelationshipTypeRepository.get_by_id(rel_type):
        raise HTTPException(status_code=409, detail=f"Relationship {rel_type} already exists")

    row = RelationshipTypeRepository.create(
        rel_type,
        description=config.get("description", ""),
        modifiers=config.get("modifiers"),
        behaviors=config.get("behaviors"),
        response_modifiers=config.get("response_modifiers"),
        trigger_mood_map=config.get("trigger_mood_map"),
        example_responses=config.get("example_responses"),
        extra=config.get("extra"),
    )
    result = dict(row)
    result["type"] = result.pop("id")
    result.pop("created_at", None)
    extra = result.pop("extra", {})
    if extra:
        result.update(extra)
    return result


@router.delete("/relationships/{rel_type}")
async def delete_relationship(rel_type: str) -> dict:
    """Delete relationship config"""
    deleted = RelationshipTypeRepository.delete(rel_type)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Relationship {rel_type} not found")
    return {"deleted": rel_type}
