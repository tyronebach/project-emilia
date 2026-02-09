"""Tests for Designer API endpoints (moods, agents, relationships)."""
import uuid

import pytest

pytestmark = pytest.mark.anyio


def uid(prefix: str = "t") -> str:
    """Generate a unique test ID to avoid collisions across runs."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ========================================
# Mood Endpoint Tests
# ========================================

class TestDesignerMoods:

    async def test_list_moods_requires_auth(self, test_client):
        response = await test_client.get("/api/designer/moods")
        assert response.status_code == 401

    async def test_list_moods(self, test_client, auth_headers):
        response = await test_client.get("/api/designer/moods", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "moods" in data
        assert isinstance(data["moods"], list)

    async def test_create_mood(self, test_client, auth_headers):
        mood_id = uid("mood")
        mood = {
            "id": mood_id,
            "valence": 0.8,
            "arousal": 0.5,
            "description": "A happy test mood",
            "emoji": "\U0001f60a",
            "category": "positive",
        }
        response = await test_client.post(
            "/api/designer/moods", json=mood, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == mood_id
        assert data["valence"] == 0.8
        assert data["category"] == "positive"

    async def test_create_mood_duplicate(self, test_client, auth_headers):
        mood_id = uid("mood")
        mood = {"id": mood_id, "valence": 0.5, "arousal": 0.5}
        await test_client.post("/api/designer/moods", json=mood, headers=auth_headers)
        response = await test_client.post(
            "/api/designer/moods", json=mood, headers=auth_headers
        )
        assert response.status_code == 409

    async def test_create_mood_missing_fields(self, test_client, auth_headers):
        response = await test_client.post(
            "/api/designer/moods",
            json={"id": uid("mood")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_update_mood(self, test_client, auth_headers):
        mood_id = uid("mood")
        await test_client.post(
            "/api/designer/moods",
            json={"id": mood_id, "valence": 0.1, "arousal": 0.2},
            headers=auth_headers,
        )
        response = await test_client.put(
            f"/api/designer/moods/{mood_id}",
            json={"valence": 0.9, "description": "Updated"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valence"] == 0.9
        assert data["description"] == "Updated"

    async def test_update_mood_404(self, test_client, auth_headers):
        response = await test_client.put(
            "/api/designer/moods/nonexistent",
            json={"valence": 0.5},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_delete_mood(self, test_client, auth_headers):
        mood_id = uid("mood")
        await test_client.post(
            "/api/designer/moods",
            json={"id": mood_id, "valence": 0.0, "arousal": 0.0},
            headers=auth_headers,
        )
        response = await test_client.delete(
            f"/api/designer/moods/{mood_id}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["deleted"] == mood_id

    async def test_delete_mood_404(self, test_client, auth_headers):
        response = await test_client.delete(
            "/api/designer/moods/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404


# ========================================
# Agent Endpoint Tests
# ========================================

class TestDesignerAgents:

    async def test_list_agents_requires_auth(self, test_client):
        response = await test_client.get("/api/designer/agents")
        assert response.status_code == 401

    async def test_list_agents(self, test_client, auth_headers):
        response = await test_client.get("/api/designer/agents", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_create_agent(self, test_client, auth_headers):
        agent_id = uid("agent")
        agent = {
            "id": agent_id,
            "name": "Test Agent",
            "baseline_valence": 0.3,
            "volatility": 1.5,
        }
        response = await test_client.post(
            "/api/designer/agents", json=agent, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == agent_id
        assert data["name"] == "Test Agent"
        assert data["baseline_valence"] == 0.3
        assert data["volatility"] == 1.5

    async def test_create_agent_duplicate(self, test_client, auth_headers):
        agent_id = uid("agent")
        agent = {"id": agent_id, "name": "Dup"}
        await test_client.post(
            "/api/designer/agents", json=agent, headers=auth_headers
        )
        response = await test_client.post(
            "/api/designer/agents", json=agent, headers=auth_headers
        )
        assert response.status_code == 409

    async def test_get_agent(self, test_client, auth_headers):
        agent_id = uid("agent")
        await test_client.post(
            "/api/designer/agents",
            json={"id": agent_id, "name": "Get Agent"},
            headers=auth_headers,
        )
        response = await test_client.get(
            f"/api/designer/agents/{agent_id}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["id"] == agent_id

    async def test_get_agent_404(self, test_client, auth_headers):
        response = await test_client.get(
            "/api/designer/agents/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404

    async def test_update_agent(self, test_client, auth_headers):
        agent_id = uid("agent")
        await test_client.post(
            "/api/designer/agents",
            json={"id": agent_id, "name": "Before"},
            headers=auth_headers,
        )
        response = await test_client.put(
            f"/api/designer/agents/{agent_id}",
            json={
                "name": "After",
                "baseline_valence": 0.7,
                "mood_baseline": {"happy": 0.5},
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "After"
        assert data["baseline_valence"] == 0.7
        assert data["mood_baseline"] == {"happy": 0.5}

    async def test_update_agent_404(self, test_client, auth_headers):
        response = await test_client.put(
            "/api/designer/agents/nonexistent",
            json={"name": "X"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_delete_agent(self, test_client, auth_headers):
        agent_id = uid("agent")
        await test_client.post(
            "/api/designer/agents",
            json={"id": agent_id},
            headers=auth_headers,
        )
        response = await test_client.delete(
            f"/api/designer/agents/{agent_id}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["deleted"] == agent_id

    async def test_delete_agent_404(self, test_client, auth_headers):
        response = await test_client.delete(
            "/api/designer/agents/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404


# ========================================
# Relationship Endpoint Tests
# ========================================

class TestDesignerRelationships:

    async def test_list_relationships_requires_auth(self, test_client):
        response = await test_client.get("/api/designer/relationships")
        assert response.status_code == 401

    async def test_list_relationships(self, test_client, auth_headers):
        response = await test_client.get(
            "/api/designer/relationships", headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_create_relationship(self, test_client, auth_headers):
        rel_type = uid("rel")
        config = {
            "description": "Test relationship",
            "modifiers": {"trust": 1.2},
            "behaviors": {"greeting": "formal"},
            "trigger_mood_map": {"compliment": {"happy": 0.3}},
        }
        response = await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json=config,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == rel_type
        assert data["description"] == "Test relationship"

    async def test_create_relationship_duplicate(self, test_client, auth_headers):
        rel_type = uid("rel")
        config = {"description": "Dup"}
        await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json=config,
            headers=auth_headers,
        )
        response = await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json=config,
            headers=auth_headers,
        )
        assert response.status_code == 409

    async def test_get_relationship(self, test_client, auth_headers):
        rel_type = uid("rel")
        await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json={"description": "Get test"},
            headers=auth_headers,
        )
        response = await test_client.get(
            f"/api/designer/relationships/{rel_type}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["type"] == rel_type

    async def test_get_relationship_404(self, test_client, auth_headers):
        response = await test_client.get(
            "/api/designer/relationships/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404

    async def test_update_relationship(self, test_client, auth_headers):
        rel_type = uid("rel")
        await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json={"description": "Before"},
            headers=auth_headers,
        )
        response = await test_client.put(
            f"/api/designer/relationships/{rel_type}",
            json={"description": "After", "modifiers": {"trust": 2.0}},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "After"

    async def test_delete_relationship(self, test_client, auth_headers):
        rel_type = uid("rel")
        await test_client.post(
            f"/api/designer/relationships/{rel_type}",
            json={"description": "Delete me"},
            headers=auth_headers,
        )
        response = await test_client.delete(
            f"/api/designer/relationships/{rel_type}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["deleted"] == rel_type

    async def test_delete_relationship_404(self, test_client, auth_headers):
        response = await test_client.delete(
            "/api/designer/relationships/nonexistent", headers=auth_headers
        )
        assert response.status_code == 404
