"""Tests for Emilia Web App API endpoints."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

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
# Session Endpoint Tests
# ========================================

class TestSessionEndpoints:

    async def test_list_sessions_requires_auth(self, test_client):
        response = await test_client.get(
            "/api/sessions",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    async def test_list_sessions_requires_user_id(self, test_client, auth_headers):
        response = await test_client.get("/api/sessions", headers=auth_headers)
        assert response.status_code == 422

    async def test_get_session_history_requires_auth(self, test_client):
        response = await test_client.get(
            "/api/sessions/test-session-id/history",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    async def test_get_session_history_returns_empty_for_nonexistent(self, test_client, auth_headers):
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = await test_client.get(
            "/api/sessions/nonexistent-session-id/history",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []
        assert data["count"] == 0
        assert data["session_id"] == "nonexistent-session-id"


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

    async def test_list_sessions_requires_auth(self, test_client):
        response = await test_client.get("/api/manage/sessions")
        assert response.status_code == 401

    async def test_list_agents_requires_auth(self, test_client):
        response = await test_client.get("/api/manage/agents")
        assert response.status_code == 401
