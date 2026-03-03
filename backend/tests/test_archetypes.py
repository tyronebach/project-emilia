import uuid

import pytest

from db.connection import get_db

pytestmark = pytest.mark.anyio


def _create_agent(agent_id: str) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO agents (
                id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                baseline_valence, baseline_arousal, baseline_dominance,
                emotional_volatility, emotional_recovery, emotional_profile
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent_id,
                "Test Agent",
                "test-claw-id",
                "emilia.vrm",
                None,
                None,
                0.2,
                0.0,
                0.0,
                0.5,
                0.1,
                "{}",
            ),
        )


async def test_list_archetypes_returns_rows(test_client, auth_headers):
    response = await test_client.get("/api/designer/v2/archetypes", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert "archetypes" in payload
    assert isinstance(payload["archetypes"], list)
    assert len(payload["archetypes"]) >= 1


async def test_archetype_crud_flow(test_client, auth_headers):
    archetype_id = f"crud-{uuid.uuid4().hex[:8]}"

    create_response = await test_client.post(
        "/api/designer/v2/archetypes",
        headers=auth_headers,
        json={
            "id": archetype_id,
            "name": "CRUD Archetype",
            "description": "Created in test",
            "message_triggers": [
                [["admiration", 0.91], ["approval", 0.64]],
                [["anger", 0.83]],
            ],
            "outcome_weights": {"positive": 0.5, "neutral": 0.3, "negative": 0.2},
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["id"] == archetype_id
    assert created["sample_count"] == 2

    detail_response = await test_client.get(
        f"/api/designer/v2/archetypes/{archetype_id}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["name"] == "CRUD Archetype"
    assert len(detail["message_triggers"]) == 2

    update_response = await test_client.put(
        f"/api/designer/v2/archetypes/{archetype_id}",
        headers=auth_headers,
        json={
            "name": "Updated Archetype",
            "description": "Updated in test",
            "outcome_weights": {"positive": 2, "neutral": 1, "negative": 1},
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Updated Archetype"
    assert updated["outcome_weights"]["positive"] == 0.5

    delete_response = await test_client.delete(
        f"/api/designer/v2/archetypes/{archetype_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    not_found_response = await test_client.get(
        f"/api/designer/v2/archetypes/{archetype_id}",
        headers=auth_headers,
    )
    assert not_found_response.status_code == 404


async def test_generate_archetype_from_file(test_client, auth_headers, monkeypatch):
    class StubClassifier:
        def classify(self, text: str):
            lowered = text.lower()
            if "amazing" in lowered:
                return [("admiration", 0.93), ("approval", 0.61)]
            if "angry" in lowered:
                return [("anger", 0.89)]
            return []

    monkeypatch.setattr(
        "db.repositories.archetype_repository.get_trigger_classifier",
        lambda: StubClassifier(),
    )

    archetype_id = f"gen-{uuid.uuid4().hex[:8]}"
    response = await test_client.post(
        "/api/designer/v2/archetypes/generate",
        headers=auth_headers,
        data={
            "id": archetype_id,
            "name": "Generated Archetype",
            "description": "Built from text file",
        },
        files={"file": ("messages.txt", b"You are amazing\nI am angry\n", "text/plain")},
    )
    assert response.status_code == 200
    generated = response.json()
    assert generated["id"] == archetype_id
    assert generated["sample_count"] == 2
    assert "trigger_distribution" in generated
    assert "admiration" in generated["trigger_distribution"]
    assert "anger" in generated["trigger_distribution"]

    detail_response = await test_client.get(
        f"/api/designer/v2/archetypes/{archetype_id}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert len(detail["message_triggers"]) == 2


async def test_generate_archetype_enforces_line_limit(test_client, auth_headers):
    archetype_id = f"limit-{uuid.uuid4().hex[:8]}"
    too_long = ("x" * 301).encode("utf-8")

    response = await test_client.post(
        "/api/designer/v2/archetypes/generate",
        headers=auth_headers,
        data={
            "id": archetype_id,
            "name": "Too Long",
            "description": "Should fail",
        },
        files={"file": ("messages.txt", too_long, "text/plain")},
    )
    assert response.status_code == 400
    assert "Line exceeds max length" in response.json()["detail"]


async def test_drift_simulate_validates_archetype_from_db(test_client, auth_headers):
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    _create_agent(agent_id)

    response = await test_client.post(
        "/api/designer/v2/drift-simulate",
        headers=auth_headers,
        json={
            "agent_id": agent_id,
            "archetype": "does-not-exist",
            "duration_days": 1,
            "sessions_per_day": 1,
            "messages_per_session": 2,
        },
    )
    assert response.status_code == 410
    assert response.json()["detail"] == "drift simulator deprecated — use /api/dreams"
