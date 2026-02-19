"""Tests for Emilia Web App API endpoints."""
import time
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from config import settings
from db.connection import get_db

pytestmark = pytest.mark.anyio


# ========================================
# Health Endpoint Tests
# ========================================

class TestHealthEndpoint:

    async def test_health_returns_200(self, test_client):
        response = await test_client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data


# ========================================
# Chat Endpoint Tests
# ========================================

class TestChatEndpoint:

    async def test_chat_requires_auth(self, test_client):
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers={"X-User-Id": "test-user", "X-Agent-Id": "test-agent"}
        )
        assert response.status_code == 401

    async def test_chat_requires_user_id(self, test_client, auth_headers):
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )
        assert response.status_code == 422

    async def test_chat_requires_agent_id(self, test_client, auth_headers):
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=headers
        )
        assert response.status_code == 422

    async def test_chat_rejects_invalid_game_context_shape(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat",
            json={
                "message": "Hello",
                "game_context": {
                    "gameId": "tic-tac-toe",
                    "state": "X | O | 3",
                    "status": "in_progress",
                    "moveCount": 1,
                    "unknownField": "not-allowed",
                },
            },
            headers=headers,
        )
        assert response.status_code == 422

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.chat.httpx.AsyncClient")
    async def test_chat_non_stream_success_returns_parsed_response(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:test-claw-id",
            "choices": [
                {
                    "message": {
                        "content": "[intent:playful] [mood:happy:0.8] Hello from non-stream!"
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
            },
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={"message": "Hi"},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["response"] == "Hello from non-stream!"
        assert data["behavior"]["intent"] == "playful"
        assert data["behavior"]["mood"] == "happy"
        assert data["usage"]["prompt_tokens"] == 10
        assert data["emotion_debug"]["snapshot"]["agent_id"] == agent_id

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.llm_caller.DirectLLMClient")
    async def test_chat_non_stream_direct_mode_uses_direct_client(
        self,
        mock_direct_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents
                   (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                    emotional_profile, chat_mode, direct_model, direct_api_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id,
                    "Direct Agent",
                    "test-claw-id",
                    "emilia.vrm",
                    None,
                    None,
                    "{}",
                    "direct",
                    "gpt-test-direct",
                    "https://example.invalid/v1",
                ),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_direct = MagicMock()
        mock_direct.chat_completion = AsyncMock(
            return_value={
                "model": "gpt-test-direct",
                "choices": [
                    {
                        "message": {
                            "content": "[intent:playful] [mood:happy:0.7] Direct hello!",
                        }
                    }
                ],
                "usage": {"prompt_tokens": 11, "completion_tokens": 6},
            }
        )
        mock_direct_client_class.return_value = mock_direct

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={"message": "Hi direct"},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["response"] == "Direct hello!"
        assert data["model"] == "gpt-test-direct"
        assert data["usage"]["prompt_tokens"] == 11
        mock_direct.chat_completion.assert_awaited_once()

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.llm_caller.DirectLLMClient")
    async def test_chat_direct_mode_rolls_back_user_message_on_direct_client_error(
        self,
        mock_direct_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents
                   (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                    emotional_profile, chat_mode, direct_model, direct_api_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id,
                    "Direct Agent",
                    "test-claw-id",
                    "emilia.vrm",
                    None,
                    None,
                    "{}",
                    "direct",
                    "gpt-test-direct",
                    "https://example.invalid/v1",
                ),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_direct = MagicMock()
        mock_direct.chat_completion = AsyncMock(side_effect=ValueError("OPENAI_API_KEY is required for direct chat mode"))
        mock_direct_client_class.return_value = mock_direct

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={"message": "Hi direct"},
            headers=headers,
        )

        assert response.status_code == 503
        assert "OPENAI_API_KEY is required" in response.json()["detail"]

        with get_db() as conn:
            row = conn.execute(
                """SELECT COUNT(*) AS count
                   FROM room_messages rm
                   JOIN room_agents ra ON ra.room_id = rm.room_id
                   WHERE ra.agent_id = ?""",
                (agent_id,),
            ).fetchone()
        assert row["count"] == 0

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("services.room_chat_stream.DirectLLMClient")
    async def test_chat_stream_direct_mode_uses_tool_loop(
        self,
        mock_direct_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents
                   (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace,
                    emotional_profile, chat_mode, direct_model, direct_api_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id,
                    "Direct Agent",
                    "test-claw-id",
                    "emilia.vrm",
                    None,
                    None,
                    "{}",
                    "direct",
                    "gpt-test-direct",
                    "https://example.invalid/v1",
                ),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_direct = MagicMock()
        mock_direct.chat_completion = AsyncMock(
            return_value={
                "model": "gpt-test-direct",
                "choices": [
                    {
                        "message": {
                            "content": "Hello direct stream",
                        }
                    }
                ],
                "usage": {"prompt_tokens": 9, "completion_tokens": 4},
            }
        )
        mock_direct_client_class.return_value = mock_direct

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=1",
            json={"message": "Stream direct"},
            headers=headers,
        )

        assert response.status_code == 200
        body = response.text
        assert '"content": "Hello direct stream"' in body
        assert '"response": "Hello direct stream"' in body
        assert '"done": true' in body
        mock_direct.chat_completion.assert_awaited_once()

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.chat.httpx.AsyncClient")
    async def test_chat_runtime_trigger_marks_message_origin_and_hides_from_history(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        monkeypatch.setattr(settings, "games_v2_agent_allowlist", set())
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:test-claw-id",
            "choices": [
                {
                    "message": {
                        "content": "[intent:playful] [move:5] Taking my move."
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 4,
            },
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={
                "message": "Your turn!",
                "runtime_trigger": True,
            },
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["response"]
        room_id = data["room_id"]

        with get_db() as conn:
            stored = conn.execute(
                "SELECT sender_type, origin, content FROM room_messages WHERE room_id = ? ORDER BY timestamp ASC",
                (room_id,),
            ).fetchall()
        assert len(stored) == 2
        assert stored[0]["sender_type"] == "user"
        assert stored[0]["origin"] == "game_runtime"
        assert stored[1]["sender_type"] == "agent"
        assert stored[1]["origin"] == "chat"

        # Verify room history excludes runtime messages by default
        history = await test_client.get(
            f"/api/rooms/{room_id}/history",
            headers=headers,
        )
        assert history.status_code == 200
        history_messages = history.json()["messages"]
        assert all(m.get("origin") != "game_runtime" for m in history_messages)

        # With includeRuntime=true, game_runtime messages are included
        history_with_runtime = await test_client.get(
            f"/api/rooms/{room_id}/history?includeRuntime=true",
            headers=headers,
        )
        assert history_with_runtime.status_code == 200
        runtime_messages = history_with_runtime.json()["messages"]
        assert len(runtime_messages) == 2
        origins = [m.get("origin") for m in runtime_messages]
        assert "game_runtime" in origins

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.chat.httpx.AsyncClient")
    async def test_chat_ignores_runtime_trigger_when_agent_not_in_games_v2_allowlist(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
        monkeypatch,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        monkeypatch.setattr(settings, "games_v2_agent_allowlist", {"agent-allowlisted"})

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:test-claw-id",
            "choices": [{"message": {"content": "Runtime trigger ignored for non-rollout agent."}}],
            "usage": {"prompt_tokens": 8, "completion_tokens": 4},
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={
                "message": "Your turn!",
                "runtime_trigger": True,
            },
            headers=headers,
        )
        assert response.status_code == 200
        room_id = response.json()["room_id"]

        with get_db() as conn:
            stored = conn.execute(
                "SELECT sender_type, origin FROM room_messages WHERE room_id = ? ORDER BY timestamp ASC",
                (room_id,),
            ).fetchall()
        assert len(stored) == 2
        assert stored[0]["sender_type"] == "user"
        assert stored[0]["origin"] == "chat"

    @patch("routers.chat._spawn_background")
    @patch("routers.chat._process_emotion_pre_llm", new_callable=AsyncMock)
    @patch("routers.chat.httpx.AsyncClient")
    async def test_chat_first_turn_includes_session_facts_block(
        self,
        mock_client_class,
        mock_pre_llm,
        mock_spawn_background,
        test_client,
        auth_headers,
    ):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Facts User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Facts Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        mock_pre_llm.return_value = (None, [])
        mock_spawn_background.side_effect = lambda coro: (coro.close(), None)[1]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "agent:test-claw-id",
            "choices": [{"message": {"content": "Hello from first turn."}}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 4},
        }

        captured_payload: dict = {}

        async def _capture_post(*args, **kwargs):
            captured_payload.update(kwargs.get("json") or {})
            return mock_response

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=_capture_post)
        mock_client_class.return_value = mock_client

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.post(
            "/api/chat?stream=0",
            json={"message": "Hi"},
            headers=headers,
        )

        assert response.status_code == 200
        assert captured_payload.get("messages")
        injected_message = captured_payload["messages"][-1]["content"]
        expected_tz_label = settings.default_timezone or "UTC"
        assert f"Session facts ({expected_tz_label}):" in injected_message
        assert "time_of_day:" in injected_message


# ========================================
# Soul Window Endpoint Tests
# ========================================

class TestSoulWindowEndpoints:

    async def test_soul_window_mood_requires_auth(self, test_client):
        response = await test_client.get("/api/soul-window/mood")
        assert response.status_code == 401

    async def test_soul_window_mood_returns_snapshot(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Soul User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Soul Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        response = await test_client.get("/api/soul-window/mood", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == user_id
        assert data["agent_id"] == agent_id
        assert "dominant_mood" in data
        assert "trust" in data
        assert "intimacy" in data

    async def test_soul_window_events_round_trip(self, test_client, auth_headers, tmp_path):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        workspace = tmp_path / f"workspace-{agent_id}"
        workspace.mkdir(parents=True, exist_ok=True)

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Soul User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Soul Agent", "test-claw-id", "emilia.vrm", None, str(workspace), "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }

        initial_resp = await test_client.get("/api/soul-window/events", headers=headers)
        assert initial_resp.status_code == 200
        assert initial_resp.json()["upcoming_events"] == []

        add_resp = await test_client.post(
            "/api/soul-window/events",
            headers=headers,
            json={
                "action": "add_event",
                "item": {
                    "id": "birthday-2026",
                    "type": "birthday",
                    "date": "2026-03-15",
                    "note": "User birthday",
                    "source": "user",
                },
            },
        )
        assert add_resp.status_code == 200
        added = add_resp.json()
        assert added["ok"] is True
        assert any(item["id"] == "birthday-2026" for item in added["events"]["upcoming_events"])

        remove_resp = await test_client.post(
            "/api/soul-window/events",
            headers=headers,
            json={
                "action": "remove_event",
                "id": "birthday-2026",
            },
        )
        assert remove_resp.status_code == 200
        removed = remove_resp.json()
        assert all(item["id"] != "birthday-2026" for item in removed["events"]["upcoming_events"])


# ========================================
# Speak Endpoint Tests
# ========================================

class TestSpeakEndpoint:

    async def test_speak_requires_auth(self, test_client):
        response = await test_client.post(
            "/api/speak",
            json={"text": "Hello"}
        )
        assert response.status_code == 401

    async def test_speak_requires_text(self, test_client, auth_headers):
        response = await test_client.post(
            "/api/speak",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 422


# ========================================
# Authorization Tests
# ========================================

class TestAuthorization:

    async def test_missing_auth_header(self, test_client):
        endpoints = [
            ("POST", "/api/chat", {"message": "test"}, {"X-User-Id": "test", "X-Agent-Id": "test"}),
            ("POST", "/api/speak", {"text": "test"}, {}),
        ]
        for method, path, body, extra_headers in endpoints:
            response = await test_client.post(path, json=body, headers=extra_headers)
            assert response.status_code == 401, f"Failed for {method} {path}"

    async def test_invalid_token(self, test_client):
        headers = {
            "Authorization": "Bearer wrong-token-123",
            "X-User-Id": "test-user",
            "X-Agent-Id": "test-agent"
        }
        response = await test_client.post(
            "/api/chat",
            json={"message": "test"},
            headers=headers
        )
        assert response.status_code == 401


# ========================================
# Memory Endpoint Tests
# ========================================

class TestMemoryEndpoints:

    async def test_memory_list_requires_auth(self, test_client):
        response = await test_client.get("/api/memory/list")
        assert response.status_code == 401

    async def test_memory_file_requires_auth(self, test_client):
        response = await test_client.get("/api/memory/test.md")
        assert response.status_code == 401


# ========================================
# User Endpoint Tests
# ========================================

class TestUserEndpoints:

    async def test_list_users_requires_auth(self, test_client):
        response = await test_client.get("/api/users")
        assert response.status_code == 401

    async def test_get_user_requires_auth(self, test_client):
        response = await test_client.get("/api/users/test-user")
        assert response.status_code == 401


# ========================================
# Transcribe Endpoint Tests
# ========================================

class TestTranscribeEndpoint:

    async def test_transcribe_requires_auth(self, test_client):
        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("test.webm", audio_data, "audio/webm")}
        )
        assert response.status_code == 401

    async def test_transcribe_requires_file(self, test_client, auth_headers):
        response = await test_client.post(
            "/api/transcribe",
            headers=auth_headers
        )
        assert response.status_code == 422

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_success(self, mock_client_class, test_client, auth_headers):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "text": "Hello world",
            "language": "en",
            "duration": 1.5
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Hello world"
        assert data["language"] == "en"

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_with_missing_content_type(self, mock_client_class, test_client, auth_headers):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "Test", "language": "en"}

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data)},
            headers=auth_headers
        )
        assert response.status_code == 200

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_stt_service_error(self, mock_client_class, test_client, auth_headers):
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )
        assert response.status_code == 500

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_timeout(self, mock_client_class, test_client, auth_headers):
        import httpx

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )
        assert response.status_code == 504

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_connection_error(self, mock_client_class, test_client, auth_headers):
        import httpx

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )
        assert response.status_code == 503


# ========================================
# Manage Endpoint Tests
# ========================================

class TestManageEndpoints:

    async def test_list_agents_requires_auth(self, test_client):
        response = await test_client.get("/api/manage/agents")
        assert response.status_code == 401

    async def test_manage_agent_update_persists_direct_mode_fields(self, test_client, auth_headers):
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                """INSERT INTO agents
                   (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )

        response = await test_client.put(
            f"/api/manage/agents/{agent_id}",
            json={
                "chat_mode": "direct",
                "direct_model": "gpt-test-direct",
                "direct_api_base": "https://example.invalid/v1",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        with get_db() as conn:
            row = conn.execute(
                "SELECT chat_mode, direct_model, direct_api_base FROM agents WHERE id = ?",
                (agent_id,),
            ).fetchone()

        assert row["chat_mode"] == "direct"
        assert row["direct_model"] == "gpt-test-direct"
        assert row["direct_api_base"] == "https://example.invalid/v1"

    async def test_manage_games_and_agent_config_affect_catalog(self, test_client, auth_headers, monkeypatch):
        monkeypatch.setattr(settings, "games_v2_agent_allowlist", set())
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        game_id = f"game-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )

        create_resp = await test_client.post(
            "/api/manage/games",
            json={
                "id": game_id,
                "display_name": "Test Game",
                "category": "board",
                "description": "A test game",
                "module_key": "test-game",
                "active": True,
                "move_provider_default": "llm",
                "rule_mode": "strict",
                "version": "1",
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 200
        assert create_resp.json()["id"] == game_id

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        catalog_before = await test_client.get("/api/games/catalog", headers=headers)
        assert catalog_before.status_code == 200
        assert any(g["id"] == game_id for g in catalog_before.json()["games"])

        disable_resp = await test_client.put(
            f"/api/manage/agents/{agent_id}/games/{game_id}",
            json={"enabled": False},
            headers=auth_headers,
        )
        assert disable_resp.status_code == 200
        assert disable_resp.json()["enabled"] is False

        catalog_after_disable = await test_client.get("/api/games/catalog", headers=headers)
        assert catalog_after_disable.status_code == 200
        assert all(g["id"] != game_id for g in catalog_after_disable.json()["games"])

        delete_cfg = await test_client.delete(
            f"/api/manage/agents/{agent_id}/games/{game_id}",
            headers=auth_headers,
        )
        assert delete_cfg.status_code == 200

        catalog_after_delete_cfg = await test_client.get("/api/games/catalog", headers=headers)
        assert catalog_after_delete_cfg.status_code == 200
        assert any(g["id"] == game_id for g in catalog_after_delete_cfg.json()["games"])

    async def test_catalog_uses_registry_fallback_when_agent_has_no_game_config(self, test_client, auth_headers, monkeypatch):
        monkeypatch.setattr(settings, "games_v2_agent_allowlist", set())
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        game_id = f"game-{uuid.uuid4().hex[:8]}"

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )
            conn.execute(
                """INSERT INTO game_registry
                   (id, display_name, category, description, module_key, active, move_provider_default, rule_mode, prompt_instructions, version, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))""",
                (
                    game_id,
                    "Registry Fallback Game",
                    "board",
                    "No override required",
                    "fallback-game",
                    "llm",
                    "strict",
                    "Fallback prompt",
                    "1",
                ),
            )
            fallback_cfg_count = conn.execute(
                "SELECT COUNT(*) AS c FROM agent_game_config WHERE agent_id = ? AND game_id = ?",
                (agent_id, game_id),
            ).fetchone()
            assert fallback_cfg_count["c"] == 0

        headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": agent_id,
        }
        catalog = await test_client.get("/api/games/catalog", headers=headers)
        assert catalog.status_code == 200
        catalog_ids = [game["id"] for game in catalog.json()["games"]]
        assert game_id in catalog_ids

    async def test_games_catalog_blocks_non_allowlisted_agent(self, test_client, auth_headers, monkeypatch):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        allowlisted_agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        blocked_agent_id = f"agent-{uuid.uuid4().hex[:8]}"

        monkeypatch.setattr(settings, "games_v2_agent_allowlist", {allowlisted_agent_id})

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (allowlisted_agent_id, "Allowlisted Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (blocked_agent_id, "Blocked Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, allowlisted_agent_id),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, blocked_agent_id),
            )

        allowlisted_headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": allowlisted_agent_id,
        }
        allowlisted_resp = await test_client.get("/api/games/catalog", headers=allowlisted_headers)
        assert allowlisted_resp.status_code == 200

        blocked_headers = {
            **auth_headers,
            "X-User-Id": user_id,
            "X-Agent-Id": blocked_agent_id,
        }
        blocked_resp = await test_client.get("/api/games/catalog", headers=blocked_headers)
        assert blocked_resp.status_code == 404
        assert blocked_resp.json()["detail"] == "Games V2 is disabled for this agent"

    async def test_delete_agent_removes_related_data(self, test_client, auth_headers):
        user_id = f"user-{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-{uuid.uuid4().hex[:8]}"
        room_id = f"room-{uuid.uuid4().hex[:8]}"
        now = time.time()

        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, display_name) VALUES (?, ?)",
                (user_id, "Test User"),
            )
            conn.execute(
                """INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace, emotional_profile)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, "Test Agent", "test-claw-id", "emilia.vrm", None, None, "{}"),
            )
            conn.execute(
                "INSERT INTO user_agents (user_id, agent_id) VALUES (?, ?)",
                (user_id, agent_id),
            )
            conn.execute(
                """INSERT INTO rooms (id, name, room_type, created_by, created_at, last_activity)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (room_id, "test", "dm", user_id, int(now), int(now)),
            )
            conn.execute(
                "INSERT INTO room_participants (room_id, user_id) VALUES (?, ?)",
                (room_id, user_id),
            )
            conn.execute(
                "INSERT INTO room_agents (room_id, agent_id) VALUES (?, ?)",
                (room_id, agent_id),
            )
            conn.execute(
                """INSERT INTO room_messages (id, room_id, sender_type, sender_id, content, timestamp, origin)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), room_id, "user", user_id, "hello", now, "chat"),
            )
            conn.execute(
                """INSERT INTO emotional_state
                   (id, user_id, agent_id, valence, arousal, dominance, trust, attachment, familiarity, last_updated)
                   VALUES (?, ?, ?, 0.0, 0.0, 0.0, 0.5, 0.3, 0.0, ?)""",
                (str(uuid.uuid4()), user_id, agent_id, now),
            )
            conn.execute(
                """INSERT INTO emotional_events_v2
                   (id, user_id, agent_id, session_id, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), user_id, agent_id, room_id, now),
            )
            conn.execute(
                """INSERT INTO trigger_counts
                   (user_id, agent_id, trigger_type, window, count, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user_id, agent_id, "greeting", "daily", 1, now),
            )
            conn.execute(
                """INSERT INTO game_stats
                   (id, room_id, user_id, agent_id, game_id, result, played_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), room_id, user_id, agent_id, "tictactoe", "win", now),
            )

        response = await test_client.delete(
            f"/api/manage/agents/{agent_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["deleted"] == 1

        with get_db() as conn:
            assert conn.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM rooms WHERE id = ?", (room_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM room_messages WHERE room_id = ?", (room_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM room_participants WHERE room_id = ?", (room_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM room_agents WHERE room_id = ?", (room_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM user_agents WHERE agent_id = ?", (agent_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM emotional_state WHERE agent_id = ?", (agent_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM emotional_events_v2 WHERE agent_id = ?", (agent_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM trigger_counts WHERE agent_id = ?", (agent_id,)).fetchone() is None
            assert conn.execute("SELECT 1 FROM game_stats WHERE agent_id = ?", (agent_id,)).fetchone() is None
