from __future__ import annotations

import uuid

from db.connection import get_db
from db.repositories import CharacterLivedExperienceRepository


def _seed_user_and_agent(user_id: str, agent_id: str) -> None:
    with get_db() as conn:
        conn.execute("INSERT INTO users (id, display_name) VALUES (?, ?)", (user_id, "User"))
        conn.execute(
            """INSERT INTO agents (
                   id, display_name, clawdbot_agent_id, vrm_model, emotional_profile
               ) VALUES (?, ?, ?, ?, ?)""",
            (agent_id, "Agent", "claw-test", "emilia.vrm", "{}"),
        )


def test_character_lived_experience_get_or_create_and_get_text() -> None:
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    _seed_user_and_agent(user_id, agent_id)

    created = CharacterLivedExperienceRepository.get_or_create(agent_id, user_id)
    assert created["agent_id"] == agent_id
    assert created["user_id"] == user_id
    assert created["lived_experience"] == ""

    with get_db() as conn:
        conn.execute(
            """UPDATE character_lived_experience
               SET lived_experience = ?
               WHERE agent_id = ? AND user_id = ?""",
            ("Remembered detail", agent_id, user_id),
        )

    assert CharacterLivedExperienceRepository.get_text(agent_id, user_id) == "Remembered detail"
    assert CharacterLivedExperienceRepository.get_text(None, user_id) == ""
    assert CharacterLivedExperienceRepository.get_text(agent_id, None) == ""
