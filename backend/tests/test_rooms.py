"""Tests for group room APIs."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from db.connection import get_db

pytestmark = pytest.mark.anyio


def _seed_user(user_id: str, name: str) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, display_name) VALUES (?, ?)",
            (user_id, name),
        )


def _seed_agent(
    agent_id: str,
    name: str,
    claw_id: str,
    *,
    chat_mode: str = "openclaw",
    direct_model: str | None = None,
    direct_api_base: str | None = None,
) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO agents
               (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                emotional_profile, chat_mode, direct_model, direct_api_base)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                agent_id,
                name,
                claw_id,
                "emilia.vrm",
                None,
                None,
                "{}",
                chat_mode,
                direct_model,
                direct_api_base,
            ),
        )


def _grant_access(user_id: str, agent_id: str) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
            (user_id, agent_id),
        )


class TestRoomCrud:

    async def test_create_list_get_update_delete_room(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        a1 = f"agent-{uuid.uuid4().hex[:8]}"
        a2 = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Room Owner")
        _seed_agent(a1, "Alpha", f"claw-{a1}")
        _seed_agent(a2, "Beta", f"claw-{a2}")
        _grant_access(user_id, a1)
        _grant_access(user_id, a2)

        headers = {**auth_headers, "X-User-Id": user_id}

        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={
                "name": "My Room",
                "agent_ids": [a1, a2],
                "settings": {"vrm_display": "hidden"},
            },
        )
        assert created.status_code == 200
        room = created.json()
        room_id = room["id"]
        assert room["name"] == "My Room"
        assert room["settings"]["vrm_display"] == "hidden"

        listed = await test_client.get("/api/rooms", headers=headers)
        assert listed.status_code == 200
        listed_data = listed.json()
        assert listed_data["count"] >= 1
        assert any(r["id"] == room_id for r in listed_data["rooms"])

        detail = await test_client.get(f"/api/rooms/{room_id}", headers=headers)
        assert detail.status_code == 200
        detail_data = detail.json()
        assert detail_data["id"] == room_id
        assert len(detail_data["agents"]) == 2
        assert detail_data["participants"][0]["user_id"] == user_id

        updated = await test_client.patch(
            f"/api/rooms/{room_id}",
            headers=headers,
            json={"name": "Renamed Room", "settings": {"response_style": "all"}},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Renamed Room"
        assert updated.json()["settings"]["response_style"] == "all"

        deleted = await test_client.delete(f"/api/rooms/{room_id}", headers=headers)
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] == 1

        missing = await test_client.get(f"/api/rooms/{room_id}", headers=headers)
        assert missing.status_code == 404

    async def test_room_access_control_blocks_non_participant(self, test_client, auth_headers):
        owner_id = f"owner-{uuid.uuid4().hex[:8]}"
        stranger_id = f"stranger-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(owner_id, "Owner")
        _seed_user(stranger_id, "Stranger")
        _seed_agent(agent_id, "Solo", f"claw-{agent_id}")
        _grant_access(owner_id, agent_id)
        _grant_access(stranger_id, agent_id)

        owner_headers = {**auth_headers, "X-User-Id": owner_id}
        stranger_headers = {**auth_headers, "X-User-Id": stranger_id}

        created = await test_client.post(
            "/api/rooms",
            headers=owner_headers,
            json={"name": "Private", "agent_ids": [agent_id]},
        )
        room_id = created.json()["id"]

        denied = await test_client.get(f"/api/rooms/{room_id}", headers=stranger_headers)
        assert denied.status_code == 403


class TestRoomAgents:

    async def test_add_update_remove_room_agent(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        a1 = f"agent-{uuid.uuid4().hex[:8]}"
        a2 = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(a1, "Alpha", f"claw-{a1}")
        _seed_agent(a2, "Beta", f"claw-{a2}")
        _grant_access(user_id, a1)
        _grant_access(user_id, a2)

        headers = {**auth_headers, "X-User-Id": user_id}

        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Team", "agent_ids": [a1]},
        )
        room_id = created.json()["id"]

        added = await test_client.post(
            f"/api/rooms/{room_id}/agents",
            headers=headers,
            json={"agent_id": a2, "response_mode": "always"},
        )
        assert added.status_code == 200
        assert added.json()["agent_id"] == a2
        assert added.json()["response_mode"] == "always"

        patched = await test_client.patch(
            f"/api/rooms/{room_id}/agents/{a2}",
            headers=headers,
            json={"response_mode": "manual", "role": "moderator"},
        )
        assert patched.status_code == 200
        assert patched.json()["response_mode"] == "manual"
        assert patched.json()["role"] == "moderator"

        removed = await test_client.delete(
            f"/api/rooms/{room_id}/agents/{a2}",
            headers=headers,
        )
        assert removed.status_code == 200
        assert removed.json()["deleted"] == 1


class TestRoomChat:

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_mentions_route_to_target_agent(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"
        beta = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _seed_agent(beta, "Beta", "claw-beta")
        _grant_access(user_id, alpha)
        _grant_access(user_id, beta)

        headers = {**auth_headers, "X-User-Id": user_id}

        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Mentions", "agent_ids": [alpha, beta]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:claw-beta",
            "choices": [{"message": {"content": "[intent:reply] Beta here"}}],
            "usage": {"prompt_tokens": 8, "completion_tokens": 4},
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "@beta hello", "mention_agents": [beta]},
        )

        assert sent.status_code == 200
        data = sent.json()
        assert data["count"] == 1
        assert data["responses"][0]["agent_id"] == beta
        assert data["responses"][0]["message"]["sender_id"] == beta

        history = await test_client.get(
            f"/api/rooms/{room_id}/history",
            headers=headers,
        )
        assert history.status_code == 200
        messages = history.json()["messages"]
        assert len(messages) == 2
        assert messages[0]["sender_type"] == "user"
        assert messages[1]["sender_type"] == "agent"
        assert messages[1]["sender_id"] == beta

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_defaults_to_always_mode_agents(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"
        beta = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _seed_agent(beta, "Beta", "claw-beta")
        _grant_access(user_id, alpha)
        _grant_access(user_id, beta)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Always Mode", "agent_ids": [alpha, beta]},
        )
        room_id = created.json()["id"]

        updated = await test_client.patch(
            f"/api/rooms/{room_id}/agents/{alpha}",
            headers=headers,
            json={"response_mode": "always"},
        )
        assert updated.status_code == 200

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Always responder"}}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 3},
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "No mention here"},
        )
        assert sent.status_code == 200
        payload = sent.json()
        assert payload["count"] == 1
        assert payload["responses"][0]["agent_id"] == alpha

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.DirectLLMClient")
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_non_stream_supports_direct_mode_agents(
        self,
        mock_client_class,
        mock_direct_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"
        beta = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _seed_agent(
            beta,
            "Beta",
            "claw-beta",
            chat_mode="direct",
            direct_model="gpt-room-direct",
            direct_api_base="https://example.invalid/v1",
        )
        _grant_access(user_id, alpha)
        _grant_access(user_id, beta)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Direct Mode Room", "agent_ids": [alpha, beta]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_direct = MagicMock()
        mock_direct.chat_completion = AsyncMock(
            return_value={
                "model": "gpt-room-direct",
                "choices": [{"message": {"content": "[intent:reply] Direct room response"}}],
                "usage": {"prompt_tokens": 6, "completion_tokens": 3},
            }
        )
        mock_direct_client_class.return_value = mock_direct

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "@beta answer this", "mention_agents": [beta]},
        )

        assert sent.status_code == 200
        payload = sent.json()
        assert payload["count"] == 1
        assert payload["responses"][0]["agent_id"] == beta
        assert payload["responses"][0]["message"]["content"] == "Direct room response"
        mock_direct.chat_completion.assert_awaited_once()
        mock_client_class.assert_not_called()

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.DirectLLMClient")
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_stream_supports_direct_mode_agents(
        self,
        mock_client_class,
        mock_direct_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        beta = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(
            beta,
            "Beta",
            "claw-beta",
            chat_mode="direct",
            direct_model="gpt-room-direct",
            direct_api_base="https://example.invalid/v1",
        )
        _grant_access(user_id, beta)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Direct Stream Room", "agent_ids": [beta]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        async def _fake_stream():
            yield {"choices": [{"delta": {"content": "Room "}}]}
            yield {"choices": [{"delta": {"content": "direct"}, "finish_reason": "stop"}]}
            yield {"usage": {"prompt_tokens": 5, "completion_tokens": 2}}

        mock_direct = MagicMock()
        mock_direct.stream_chat_completion = MagicMock(return_value=_fake_stream())
        mock_direct_client_class.return_value = mock_direct

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "stream please"},
        )

        assert sent.status_code == 200
        body = sent.text
        assert "event: agent_done" in body
        assert '"content": "Room direct"' in body
        mock_direct.stream_chat_completion.assert_called_once()
        mock_client_class.assert_not_called()
