"""Tests for group room APIs."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from db.connection import get_db
from db.repositories import RoomMessageRepository, RoomRepository

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
    workspace: str | None = None,
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
                workspace,
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
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_mentions_route_to_target_agent(
        self,
        mock_call_llm,
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

        mock_call_llm.return_value = {
            "model": "agent:claw-beta",
            "choices": [{"message": {"content": "[intent:reply] Beta here"}}],
            "usage": {"prompt_tokens": 8, "completion_tokens": 4},
        }

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
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_defaults_to_always_mode_agents(
        self,
        mock_call_llm,
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

        mock_call_llm.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Always responder"}}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 3},
        }

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
    @patch("services.llm_caller.get_provider")
    async def test_room_chat_non_stream_supports_direct_mode_agents(
        self,
        mock_get_provider,
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

        mock_provider = MagicMock()
        mock_provider.generate = AsyncMock(
            return_value={
                "model": "gpt-room-direct",
                "choices": [{"message": {"content": "[intent:reply] Direct room response"}}],
                "usage": {"prompt_tokens": 6, "completion_tokens": 3},
            }
        )
        mock_get_provider.return_value = mock_provider

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
        mock_provider.generate.assert_awaited_once()

    @patch("services.room_chat_stream._spawn_background")
    @patch("services.room_chat_stream._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.room_chat_stream.get_provider")
    async def test_room_chat_stream_supports_direct_mode_agents(
        self,
        mock_get_provider,
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

        async def _stream(*args, **kwargs):
            yield {"type": "content", "content": "Room direct"}
            yield {"type": "usage", "usage": {"prompt_tokens": 5, "completion_tokens": 2}}
            yield {"type": "done", "model": "gpt-room-direct", "finish_reason": "stop"}

        mock_provider = MagicMock()
        mock_provider.stream = _stream
        mock_get_provider.return_value = mock_provider

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "stream please"},
        )

        assert sent.status_code == 200
        body = sent.text
        assert "event: agent_done" in body
        assert '"content": "Room direct"' in body

    @patch("services.room_chat_stream._spawn_background")
    @patch("services.room_chat_stream._safe_get_mood_snapshot")
    @patch("services.room_chat_stream._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.room_chat_stream.get_provider")
    async def test_room_chat_stream_emits_avatar_and_emotion_events(
        self,
        mock_get_provider,
        mock_pre_llm,
        mock_snapshot,
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
            json={"name": "Event Stream Room", "agent_ids": [beta]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = ("Emotion context", [("joy", 0.8)])
        mock_snapshot.return_value = {"dominant_mood": "happy"}
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        async def _stream(*args, **kwargs):
            yield {
                "type": "content",
                "content": "[intent:greeting] [mood:happy:0.8] [energy:high] hi room",
            }
            yield {"type": "usage", "usage": {"prompt_tokens": 7, "completion_tokens": 4}}
            yield {"type": "done", "model": "gpt-room-direct", "finish_reason": "stop"}

        mock_provider = MagicMock()
        mock_provider.stream = _stream
        mock_get_provider.return_value = mock_provider

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "stream events"},
        )

        assert sent.status_code == 200
        body = sent.text
        assert "event: agent_done" in body
        assert "event: avatar" in body
        assert "event: emotion" in body
        assert '"intent": "greeting"' in body
        assert '"context_block": "Emotion context"' in body

    async def test_room_chat_rejects_invalid_game_context_payload(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Validation Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        invalid_game_context = {
            "gameId": "tic_tac_toe",
            "state": "X to move",
            "validMoves": [f"move{i}" for i in range(101)],
        }
        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={
                "message": "runtime update",
                "game_context": invalid_game_context,
            },
        )

        assert sent.status_code == 422

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_runtime_trigger_uses_game_runtime_origin_and_history_filtering(
        self,
        mock_call_llm,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        from routers import rooms as rooms_router
        monkeypatch.setattr(rooms_router.settings, "games_v2_agent_allowlist", set())
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Runtime Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_call_llm.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Runtime acknowledged"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        }

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "runtime tick", "runtime_trigger": True},
        )

        assert sent.status_code == 200
        assert mock_pre_llm.await_count == 1
        first_call_args = mock_pre_llm.await_args_list[0].args
        assert first_call_args[2] == ""

        history_default = await test_client.get(
            f"/api/rooms/{room_id}/history",
            headers=headers,
        )
        assert history_default.status_code == 200
        default_messages = history_default.json()["messages"]
        assert len(default_messages) == 1
        assert default_messages[0]["sender_type"] == "agent"

        history_runtime = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history_runtime.status_code == 200
        runtime_messages = history_runtime.json()["messages"]
        assert len(runtime_messages) == 2
        assert runtime_messages[0]["sender_type"] == "user"
        assert runtime_messages[0]["origin"] == "game_runtime"

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._build_first_turn_context")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_builds_first_turn_context_once_per_agent(
        self,
        mock_call_llm,
        mock_pre_llm,
        mock_first_turn_context,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "First Turn Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_first_turn_context.return_value = "Session facts (UTC): ..."
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_call_llm.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Hello there"}}],
            "usage": {"prompt_tokens": 6, "completion_tokens": 3},
        }

        first = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "first"},
        )
        assert first.status_code == 200

        second = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "second"},
        )
        assert second.status_code == 200

        assert mock_first_turn_context.call_count == 1

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms.asyncio.to_thread")
    @patch("routers.rooms._ensure_workspace_milestones")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_triggers_workspace_milestones_when_workspace_configured(
        self,
        mock_call_llm,
        mock_pre_llm,
        mock_ensure_workspace_milestones,
        mock_to_thread,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"
        workspace = f"/tmp/{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha", workspace=workspace)
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Workspace Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])

        async def _noop():
            return None

        mock_to_thread.side_effect = lambda *_args, **_kwargs: _noop()
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_call_llm.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Milestone updated"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        }

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "hello"},
        )
        assert sent.status_code == 200

        milestone_calls = [
            call for call in mock_to_thread.call_args_list
            if call.args and call.args[0] is mock_ensure_workspace_milestones
        ]
        assert milestone_calls, "Expected _ensure_workspace_milestones to be scheduled"

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms.asyncio.to_thread")
    @patch("routers.rooms._process_emotion_post_llm")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_post_llm_uses_namespaced_room_session_id(
        self,
        mock_call_llm,
        mock_pre_llm,
        mock_post_llm,
        mock_to_thread,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Emotion Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])

        async def _noop():
            return None

        mock_to_thread.side_effect = lambda *_args, **_kwargs: _noop()
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_call_llm.return_value = {
            "model": "agent:claw-alpha",
            "choices": [{"message": {"content": "Emotion stored"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        }

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "track emotion"},
        )
        assert sent.status_code == 200

        post_calls = [
            call for call in mock_to_thread.call_args_list
            if call.args and call.args[0] is mock_post_llm
        ]
        assert post_calls, "Expected _process_emotion_post_llm to be scheduled"
        assert post_calls[0].args[4] == f"room:{room_id}"

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_non_stream_valueerror_returns_actionable_503_without_legacy_fallback(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_call_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Actionable Failure Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]
        mock_call_llm.side_effect = ValueError("OPENAI_API_KEY is required for direct chat mode")

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "this should fail cleanly"},
        )
        assert sent.status_code == 503
        assert "OPENAI_API_KEY is required" in sent.json()["detail"]
        mock_client_class.assert_not_called()

        history = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history.status_code == 200
        assert history.json()["count"] == 0

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.call_llm_non_stream", new_callable=AsyncMock)
    async def test_room_chat_non_stream_deletes_user_message_when_all_agents_fail(
        self,
        mock_call_llm,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Failure Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]
        mock_call_llm.side_effect = RuntimeError("Service unavailable")

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=0",
            headers=headers,
            json={"message": "this should fail"},
        )
        assert sent.status_code == 503

        history = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history.status_code == 200
        assert history.json()["count"] == 0

    @patch("routers.rooms._spawn_background")
    @patch("routers.rooms._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.rooms.httpx.AsyncClient")
    async def test_room_chat_stream_deletes_user_message_when_all_agents_fail(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Stream Failure Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        stream_response = MagicMock()
        stream_response.status_code = 503

        stream_ctx = MagicMock()
        stream_ctx.__aenter__ = AsyncMock(return_value=stream_response)
        stream_ctx.__aexit__ = AsyncMock(return_value=None)

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.stream = MagicMock(return_value=stream_ctx)
        mock_client_class.return_value = mock_client

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "stream should fail"},
        )
        assert sent.status_code == 200
        assert "event: agent_error" in sent.text

        history = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history.status_code == 200
        assert history.json()["count"] == 0

    @patch("services.room_chat_stream._spawn_background")
    @patch("services.room_chat_stream._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.room_chat_stream.get_provider")
    async def test_room_chat_stream_truncates_oversized_direct_response(
        self,
        mock_get_provider,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"
        oversized_content = "x" * 60000

        _seed_user(user_id, "Owner")
        _seed_agent(
            alpha,
            "Alpha",
            "claw-alpha",
            chat_mode="direct",
            direct_model="gpt-room-direct",
            direct_api_base="https://example.invalid/v1",
        )
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Truncate Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        async def _stream(*args, **kwargs):
            yield {"type": "content", "content": oversized_content}
            yield {"type": "usage", "usage": {"prompt_tokens": 10, "completion_tokens": 10}}
            yield {"type": "done", "model": "gpt-room-direct", "finish_reason": "stop"}

        mock_provider = MagicMock()
        mock_provider.stream = _stream
        mock_get_provider.return_value = mock_provider

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "truncate this"},
        )
        assert sent.status_code == 200
        assert "event: agent_done" in sent.text

        history = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history.status_code == 200
        messages = history.json()["messages"]
        assert len(messages) == 2
        assert messages[1]["sender_type"] == "agent"
        assert len(messages[1]["content"]) == 50000

    @patch("services.room_chat_stream._spawn_background")
    @patch("services.room_chat_stream._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.room_chat_stream.get_provider")
    async def test_room_chat_stream_returns_agent_error_for_stubbed_openclaw_provider(
        self,
        mock_get_provider,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Stub Provider Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        async def _stubbed_stream(*args, **kwargs):
            raise NotImplementedError("OpenClawProvider.stream — implemented in Phase F")
            yield

        mock_provider = MagicMock()
        mock_provider.stream = _stubbed_stream
        mock_get_provider.return_value = mock_provider

        sent = await test_client.post(
            f"/api/rooms/{room_id}/chat?stream=1",
            headers=headers,
            json={"message": "stream should gracefully fail"},
        )

        assert sent.status_code == 200
        assert "event: agent_error" in sent.text
        assert "OpenClawProvider.stream" in sent.text


class TestRoomCompaction:

    @patch("services.compaction.CompactionService.summarize_messages", new_callable=AsyncMock)
    async def test_room_compaction_updates_summary_when_threshold_exceeded(
        self,
        mock_summarize,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        from services import room_chat_stream as rcs_mod

        monkeypatch.setattr(rcs_mod.settings, "compact_threshold", 2)
        monkeypatch.setattr(rcs_mod.settings, "compact_keep_recent", 1)
        mock_summarize.return_value = "Compacted room summary"

        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Compact Summary Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        RoomMessageRepository.add(room_id, "user", user_id, "u1", origin="chat")
        RoomMessageRepository.add(room_id, "agent", alpha, "a1", origin="chat")
        RoomMessageRepository.add(room_id, "user", user_id, "u2", origin="chat")

        result = await rcs_mod.maybe_compact_room(room_id)
        assert result is not None
        assert result["compacted"] is True
        assert RoomRepository.get_summary(room_id) == "Compacted room summary"
        assert mock_summarize.await_count == 1

    @patch("services.compaction.CompactionService.summarize_messages", new_callable=AsyncMock)
    async def test_room_compaction_prunes_old_messages_to_keep_recent(
        self,
        mock_summarize,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        from services import room_chat_stream as rcs_mod

        monkeypatch.setattr(rcs_mod.settings, "compact_threshold", 1)
        monkeypatch.setattr(rcs_mod.settings, "compact_keep_recent", 2)
        mock_summarize.return_value = "Pruned summary"

        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={"name": "Compact Prune Room", "agent_ids": [alpha]},
        )
        room_id = created.json()["id"]

        RoomMessageRepository.add(room_id, "user", user_id, "u1", origin="chat")
        RoomMessageRepository.add(room_id, "agent", alpha, "a1", origin="chat")
        RoomMessageRepository.add(room_id, "user", user_id, "u2", origin="chat")
        RoomMessageRepository.add(room_id, "agent", alpha, "a2", origin="chat")

        result = await rcs_mod.maybe_compact_room(room_id)
        assert result is not None
        assert result["compacted"] is True
        assert RoomRepository.get_message_count(room_id) == 2

    @patch("services.compaction.CompactionService.summarize_messages", new_callable=AsyncMock)
    async def test_room_compaction_skips_when_compact_disabled(
        self,
        mock_summarize,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        from services import room_chat_stream as rcs_mod

        monkeypatch.setattr(rcs_mod.settings, "compact_threshold", 1)
        monkeypatch.setattr(rcs_mod.settings, "compact_keep_recent", 1)

        user_id = f"user-{uuid.uuid4().hex[:8]}"
        alpha = f"agent-{uuid.uuid4().hex[:8]}"

        _seed_user(user_id, "Owner")
        _seed_agent(alpha, "Alpha", "claw-alpha")
        _grant_access(user_id, alpha)

        headers = {**auth_headers, "X-User-Id": user_id}
        created = await test_client.post(
            "/api/rooms",
            headers=headers,
            json={
                "name": "Compact Disabled Room",
                "agent_ids": [alpha],
                "settings": {"compact_enabled": False},
            },
        )
        room_id = created.json()["id"]

        RoomMessageRepository.add(room_id, "user", user_id, "u1", origin="chat")
        RoomMessageRepository.add(room_id, "agent", alpha, "a1", origin="chat")
        RoomMessageRepository.add(room_id, "user", user_id, "u2", origin="chat")

        result = await rcs_mod.maybe_compact_room(room_id)
        assert result is None
        assert RoomRepository.get_message_count(room_id) == 3
        assert RoomRepository.get_summary(room_id) is None
        assert mock_summarize.await_count == 0
