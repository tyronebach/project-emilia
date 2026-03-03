from __future__ import annotations

import json
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from db.connection import get_db
from services.dreams.runtime import execute_dream

pytestmark = pytest.mark.anyio


def _seed_pair(tmp_path: Path) -> tuple[str, str, str]:
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    room_id = f"room-{uuid.uuid4().hex[:8]}"
    workspace = tmp_path / agent_id
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "SOUL.md").write_text(
        """# SOUL.md — Dreamer

## Canon
### Identity
- **Name:** Dreamer
- **Voice:** Careful
""",
        encoding="utf-8",
    )

    with get_db() as conn:
        conn.execute("INSERT INTO users (id, display_name) VALUES (?, ?)", (user_id, "User"))
        conn.execute(
            """INSERT INTO agents (
                   id, display_name, workspace, provider, provider_config, emotional_profile
               ) VALUES (?, ?, ?, 'native', ?, '{}')""",
            (agent_id, "Dreamer", str(workspace), json.dumps({"model": "gpt-test"})),
        )
        conn.execute("INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)", (user_id, agent_id))
        conn.execute(
            "INSERT INTO rooms (id, name, room_type, created_by, created_at, last_activity) VALUES (?, ?, 'dm', ?, strftime('%s','now'), strftime('%s','now'))",
            (room_id, "Dream Room", user_id),
        )
        conn.execute("INSERT INTO room_participants (room_id, user_id) VALUES (?, ?)", (room_id, user_id))
        conn.execute("INSERT INTO room_agents (room_id, agent_id) VALUES (?, ?)", (room_id, agent_id))
        conn.execute(
            """INSERT INTO room_messages (id, room_id, sender_type, sender_id, content, timestamp, origin)
               VALUES (?, ?, 'user', ?, 'You were rude yesterday', ?, 'chat')""",
            (str(uuid.uuid4()), room_id, user_id, 1000.0),
        )
        conn.execute(
            """INSERT INTO room_messages (id, room_id, sender_type, sender_id, content, timestamp, origin)
               VALUES (?, ?, 'agent', ?, 'I know.', ?, 'chat')""",
            (str(uuid.uuid4()), room_id, agent_id, 1001.0),
        )
        conn.execute(
            """INSERT INTO emotional_state (
                   id, user_id, agent_id, trust, attachment, intimacy, familiarity, last_updated
               ) VALUES (?, ?, ?, 0.1, 0.2, 0.3, 0.4, 1001.0)""",
            (str(uuid.uuid4()), user_id, agent_id),
        )
        conn.execute(
            """INSERT INTO character_lived_experience (agent_id, user_id, lived_experience, dream_count)
               VALUES (?, ?, ?, 0)""",
            (agent_id, user_id, "Old memory"),
        )

    return user_id, agent_id, room_id


@patch("services.dreams.runtime._call_dream_llm", new_callable=AsyncMock)
async def test_execute_dream_updates_lived_experience_and_clamps_deltas(mock_call, tmp_path: Path) -> None:
    user_id, agent_id, _room_id = _seed_pair(tmp_path)
    mock_call.return_value = {
        "model": "gpt-test",
        "choices": [{
            "message": {
                "content": json.dumps({
                    "lived_experience_update": "N" * 800,
                    "relationship_adjustments": {
                        "trust_delta": -9,
                        "attachment_delta": 9,
                        "intimacy_delta": -9,
                    },
                    "internal_monologue": "I am re-evaluating them.",
                })
            }
        }],
    }

    row = await execute_dream(user_id, agent_id, triggered_by="manual")

    assert row["triggered_by"] == "manual"
    assert row["trust_delta"] == -0.2
    assert row["attachment_delta"] == 0.1
    assert row["intimacy_delta"] == -0.1

    with get_db() as conn:
        lived = conn.execute(
            "SELECT lived_experience, dream_count FROM character_lived_experience WHERE agent_id = ? AND user_id = ?",
            (agent_id, user_id),
        ).fetchone()
        state = conn.execute(
            "SELECT trust, attachment, intimacy FROM emotional_state WHERE agent_id = ? AND user_id = ?",
            (agent_id, user_id),
        ).fetchone()

    assert len(lived["lived_experience"]) == 500
    assert lived["dream_count"] == 1
    assert state["trust"] == 0.0
    assert state["attachment"] == pytest.approx(0.3)
    assert state["intimacy"] == pytest.approx(0.2)


@patch("routers.dreams.execute_dream", new_callable=AsyncMock)
async def test_dream_api_endpoints_round_trip(mock_execute_dream, test_client, auth_headers, tmp_path: Path) -> None:
    user_id, agent_id, _room_id = _seed_pair(tmp_path)
    mock_execute_dream.return_value = {
        "id": "dream-1",
        "user_id": user_id,
        "agent_id": agent_id,
        "triggered_by": "manual",
    }

    trigger = await test_client.post(f"/api/dreams/{agent_id}/{user_id}/trigger", headers=auth_headers)
    assert trigger.status_code == 200
    assert trigger.json()["id"] == "dream-1"

    status = await test_client.get(f"/api/dreams/{agent_id}/{user_id}", headers=auth_headers)
    assert status.status_code == 200
    assert status.json()["lived_experience"]["lived_experience"] == "Old memory"

    reset = await test_client.delete(f"/api/dreams/{agent_id}/{user_id}/reset", headers=auth_headers)
    assert reset.status_code == 200

    log = await test_client.get(f"/api/dreams/{agent_id}/{user_id}/log", headers=auth_headers)
    assert log.status_code == 200
    assert log.json()["count"] >= 0
