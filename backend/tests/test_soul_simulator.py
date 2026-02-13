import uuid

import httpx
import pytest

from config import settings
from db.connection import get_db

pytestmark = pytest.mark.anyio


def _create_agent(agent_id: str, workspace: str | None = None) -> None:
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
                "Soul Sim Test Agent",
                "test-claw-id",
                "emilia.vrm",
                None,
                workspace,
                0.0,
                0.0,
                0.0,
                1.0,
                0.1,
                "{}",
            ),
        )


async def test_soul_simulate_inline_soul_md(test_client, auth_headers, monkeypatch):
    exchange = [
        {"role": "user", "content": "I'm overwhelmed today."},
        {"role": "assistant", "content": "Rem is here with you."},
    ]
    analysis = {
        "consistency_score": 0.88,
        "voice_markers": ["gentle reassurance"],
        "emotional_alignment": "Good support in distress context.",
        "character_breaks": [],
        "tuning_hints": ["Add one concrete grounding suggestion."],
        "verdict": "good",
        "score": 0.86,
    }

    async def fake_run_exchange(**kwargs):
        assert kwargs["archetype_id"] == "venting-sad"
        assert kwargs["turns"] == 1
        return exchange

    async def fake_analyze_exchange(**kwargs):
        assert kwargs["archetype_id"] == "venting-sad"
        assert kwargs["exchange"] == exchange
        return analysis

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)
    monkeypatch.setattr("routers.designer_v2.analyze_exchange", fake_analyze_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n## Essence\n- Gentle and devoted",
            "archetype": "venting-sad",
            "turns": 1,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["exchange"] == exchange
    assert payload["analysis"] == analysis
    assert payload["config"]["archetype"] == "venting-sad"
    assert payload["config"]["persona_model"] == settings.soul_sim_persona_model
    assert payload["config"]["archetype_model"] == "gpt-5-mini"
    assert payload["config"]["judge_model"] == "gpt-5-mini"


async def test_soul_simulate_loads_workspace_soul_md(test_client, auth_headers, monkeypatch, tmp_path):
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    workspace = tmp_path / "agent_workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    soul_text = "# SOUL.md\n## Essence\n- Soft spoken"
    (workspace / "SOUL.md").write_text(soul_text, encoding="utf-8")
    _create_agent(agent_id, str(workspace))

    captured: dict[str, str] = {}

    async def fake_run_exchange(**kwargs):
        captured["soul_md"] = kwargs["soul_md"]
        return [
            {"role": "user", "content": "Hey"},
            {"role": "assistant", "content": "Hello"},
        ]

    async def fake_analyze_exchange(**kwargs):
        return {
            "consistency_score": 1.0,
            "voice_markers": [],
            "emotional_alignment": "ok",
            "character_breaks": [],
            "tuning_hints": [],
            "verdict": "excellent",
            "score": 1.0,
        }

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)
    monkeypatch.setattr("routers.designer_v2.analyze_exchange", fake_analyze_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "agent_id": agent_id,
            "archetype": "friendly-casual",
            "turns": 1,
        },
    )
    assert response.status_code == 200
    assert captured["soul_md"] == soul_text


async def test_soul_simulate_rejects_unknown_archetype(test_client, auth_headers):
    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "does-not-exist",
            "turns": 1,
        },
    )
    assert response.status_code == 400
    assert "Unknown archetype" in response.json()["detail"]


async def test_soul_simulate_requires_one_input_mode(test_client, auth_headers):
    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={"archetype": "venting-sad"},
    )
    assert response.status_code == 400
    assert "exactly one of soul_md or agent_id" in response.json()["detail"]


async def test_soul_simulate_rejects_turns_out_of_range(test_client, auth_headers):
    for turns in (0, settings.soul_sim_max_turns + 1):
        response = await test_client.post(
            "/api/designer/v2/soul/simulate",
            headers=auth_headers,
            json={
                "soul_md": "# SOUL.md\n- test",
                "archetype": "venting-sad",
                "turns": turns,
            },
        )
        assert response.status_code == 400
        assert "turns must be between 1 and" in response.json()["detail"]


async def test_soul_simulate_alias_normalization(test_client, auth_headers, monkeypatch):
    async def fake_run_exchange(**kwargs):
        assert kwargs["archetype_id"] == "venting-sad"
        return [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]

    async def fake_analyze_exchange(**kwargs):
        return {
            "consistency_score": 0.5,
            "voice_markers": [],
            "emotional_alignment": "ok",
            "character_breaks": [],
            "tuning_hints": [],
            "verdict": "fair",
            "score": 0.5,
        }

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)
    monkeypatch.setattr("routers.designer_v2.analyze_exchange", fake_analyze_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting_sad",
            "turns": 1,
        },
    )
    assert response.status_code == 200
    assert response.json()["config"]["archetype"] == "venting-sad"


async def test_soul_simulate_maps_upstream_errors(test_client, auth_headers, monkeypatch):
    async def fake_run_exchange(**_kwargs):
        request = httpx.Request("POST", "http://test")
        raise httpx.ConnectError("connect failed", request=request)

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
        },
    )
    assert response.status_code == 503
    assert "Soul simulation service unavailable" in response.json()["detail"]


async def test_soul_simulate_maps_timeout_errors(test_client, auth_headers, monkeypatch):
    async def fake_run_exchange(**_kwargs):
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
        },
    )
    assert response.status_code == 504
    assert "Soul simulation timeout" in response.json()["detail"]


async def test_soul_simulate_default_timeout_in_config(test_client, auth_headers, monkeypatch):
    async def fake_run_exchange(**kwargs):
        return [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]

    async def fake_analyze_exchange(**kwargs):
        return {
            "consistency_score": 0.5,
            "voice_markers": [],
            "emotional_alignment": "ok",
            "character_breaks": [],
            "tuning_hints": [],
            "verdict": "fair",
            "score": 0.5,
        }

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)
    monkeypatch.setattr("routers.designer_v2.analyze_exchange", fake_analyze_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
        },
    )
    assert response.status_code == 200
    assert response.json()["config"]["timeout_per_call"] == 90.0


async def test_soul_simulate_custom_timeout_passthrough(test_client, auth_headers, monkeypatch):
    captured: dict[str, float] = {}

    async def fake_run_exchange(**kwargs):
        captured["run_timeout"] = kwargs.get("timeout_per_call")
        return [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]

    async def fake_analyze_exchange(**kwargs):
        captured["analyze_timeout"] = kwargs.get("timeout_per_call")
        return {
            "consistency_score": 0.5,
            "voice_markers": [],
            "emotional_alignment": "ok",
            "character_breaks": [],
            "tuning_hints": [],
            "verdict": "fair",
            "score": 0.5,
        }

    monkeypatch.setattr("routers.designer_v2.run_exchange", fake_run_exchange)
    monkeypatch.setattr("routers.designer_v2.analyze_exchange", fake_analyze_exchange)

    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
            "timeout_per_call": 120,
        },
    )
    assert response.status_code == 200
    assert response.json()["config"]["timeout_per_call"] == 120.0
    assert captured["run_timeout"] == 120.0
    assert captured["analyze_timeout"] == 120.0


async def test_soul_simulate_rejects_timeout_too_low(test_client, auth_headers):
    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
            "timeout_per_call": 5,
        },
    )
    assert response.status_code == 400
    assert "timeout_per_call must be between 10 and 300" in response.json()["detail"]


async def test_soul_simulate_rejects_timeout_too_high(test_client, auth_headers):
    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
            "timeout_per_call": 500,
        },
    )
    assert response.status_code == 400
    assert "timeout_per_call must be between 10 and 300" in response.json()["detail"]


async def test_soul_simulate_rejects_timeout_non_numeric(test_client, auth_headers):
    response = await test_client.post(
        "/api/designer/v2/soul/simulate",
        headers=auth_headers,
        json={
            "soul_md": "# SOUL.md\n- test",
            "archetype": "venting-sad",
            "turns": 1,
            "timeout_per_call": "not-a-number",
        },
    )
    assert response.status_code == 400
    assert "timeout_per_call must be a number" in response.json()["detail"]
